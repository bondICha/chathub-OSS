import { FC, useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Browser from 'webextension-polyfill';
import toast from 'react-hot-toast';

// 保護キー（絶対に削除しないキー）
const PROTECTED_KEYS = {
  sync: [
    // user-config.ts管理のキー
    'startupPage',
    'chatgptWebAccess',
    'claudeWebAccess',
    'providerConfigs',
    'commonSystemMessage',
    'fontType',
    // その他のアクティブキー
    'lastCheckReleaseNotesVersion',
    'openTimes',
    'premiumModalOpenTimes',
    'hasUsedOmniboxSearch'
  ],
  local: [
    // user-config.ts管理のキー
    'customApiConfigs',
    'savedChatPairs',
    // その他のアクティブキー
    'prompts',
    'allInOnePairs',
    'sessionSnapshots',
    'allInOneSessions',
    'pendingOmniboxSearch'
  ],
  patterns: [
    'conversations:',        // チャット履歴: conversations:${index}
    'conversation:',         // 個別チャット: conversation:${index}:${cid}:messages
    'companyProfile_'        // 企業プロファイル: companyProfile_${companyName}
  ]
};

// 安全に削除できるキー（デフォルト削除対象）
const SAFE_TO_DELETE_KEYS = {
  sync: [
    'tokenUsage',
    'enabledBots',
    'useCustomChatbotOnly',
    'customApiKey',
    'customApiHost',
    'isCustomApiHostFullPath',
    'savedChatPairs'         // Localに移行済みの古いSyncデータ
  ],
  local: [] as string[],     // Local storage用の安全削除キー（現在はなし）
  patterns: [
    'customApiConfig_'       // レガシーAPI設定: customApiConfig_${index}
  ]
};

// 削除モードのタイプ
type CleanupMode = 'safe' | 'aggressive';

interface CleanupTargets {
  syncKeys: string[];
  localKeys: string[];
  total: number;
}

interface Props {
  onCleanupComplete?: () => void;
}

const OldStorageNotification: FC<Props> = ({ onCleanupComplete }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false); // コンポーネントが表示されているか
  const [showNotification, setShowNotification] = useState(false);
  const [storageKeysCount, setStorageKeysCount] = useState(0);
  const [unusedSyncKeys, setUnusedSyncKeys] = useState<string[]>([]);
  const [unusedLocalKeys, setUnusedLocalKeys] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [cleanupMode, setCleanupMode] = useState<CleanupMode>('safe');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [safeTargets, setSafeTargets] = useState<CleanupTargets>({ syncKeys: [], localKeys: [], total: 0 });
  const [aggressiveTargets, setAggressiveTargets] = useState<CleanupTargets>({ syncKeys: [], localKeys: [], total: 0 });

  // Intersection Observerでコンポーネントが表示されたら検索を開始
  const observerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1, rootMargin: '100px' } // 少し早めに検出開始
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  // キーが保護されているかチェック
  const isProtectedKey = (key: string, storageType: 'sync' | 'local'): boolean => {
    if (PROTECTED_KEYS[storageType].includes(key)) {
      return true;
    }
    // パターンマッチで保護キーをチェック
    return PROTECTED_KEYS.patterns.some(pattern => key.startsWith(pattern));
  };

  // キーが安全に削除できるかチェック
  const isSafeToDeleteKey = (key: string, storageType: 'sync' | 'local'): boolean => {
    if (SAFE_TO_DELETE_KEYS[storageType].includes(key)) {
      return true;
    }
    // パターンマッチで安全削除キーをチェック
    return SAFE_TO_DELETE_KEYS.patterns.some(pattern => key.startsWith(pattern));
  };

  // クリーンアップ対象のキーを検出
  const detectCleanupTargets = async (mode: CleanupMode): Promise<CleanupTargets> => {
    try {
      const [syncData, localData] = await Promise.all([
        Browser.storage.sync.get(null),
        Browser.storage.local.get(null)
      ]);

      const syncKeys = Object.keys(syncData).filter(key => {
        // 保護キーは常に除外
        if (isProtectedKey(key, 'sync')) {
          return false;
        }

        if (mode === 'safe') {
          // セーフモード：安全に削除できるキーのみ
          return isSafeToDeleteKey(key, 'sync');
        } else {
          // アグレッシブモード：保護キー以外すべて
          return true;
        }
      });

      const localKeys = Object.keys(localData).filter(key => {
        // 保護キーは常に除外
        if (isProtectedKey(key, 'local')) {
          return false;
        }

        if (mode === 'safe') {
          // セーフモード：安全に削除できるキーのみ
          return isSafeToDeleteKey(key, 'local');
        } else {
          // アグレッシブモード：保護キー以外すべて
          return true;
        }
      });

      return {
        syncKeys,
        localKeys,
        total: syncKeys.length + localKeys.length
      };
    } catch (error) {
      console.error('Error detecting cleanup targets:', error);
      return { syncKeys: [], localKeys: [], total: 0 };
    }
  };

  // Aggressive Modeでのみ消えるキーを計算（差分）
  const getAggressiveOnlyTargets = (): CleanupTargets => {
    const safeSyncSet = new Set(safeTargets.syncKeys);
    const safeLocalSet = new Set(safeTargets.localKeys);

    const aggressiveOnlySyncKeys = aggressiveTargets.syncKeys.filter(key => !safeSyncSet.has(key));
    const aggressiveOnlyLocalKeys = aggressiveTargets.localKeys.filter(key => !safeLocalSet.has(key));

    return {
      syncKeys: aggressiveOnlySyncKeys,
      localKeys: aggressiveOnlyLocalKeys,
      total: aggressiveOnlySyncKeys.length + aggressiveOnlyLocalKeys.length
    };
  };

  // Detect old storage keys that should be removed (visibility-based lazy loading)
  useEffect(() => {
    if (!isVisible) return; // 表示されるまで実行しない

    const detectOldStorageKeys = async () => {
      setIsDetecting(true);

      // requestIdleCallbackを使ってアイドル時間に実行
      const runDetection = () => {
        return new Promise<void>((resolve) => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => resolve());
          } else {
            setTimeout(resolve, 0); // フォールバック
          }
        });
      };

      try {
        await runDetection(); // アイドル時間を待つ

        const [safe, aggressive] = await Promise.all([
          detectCleanupTargets('safe'),
          detectCleanupTargets('aggressive')
        ]);

        setSafeTargets(safe);
        setAggressiveTargets(aggressive);

        // 現在選択中のモードの対象を設定
        const currentTargets = cleanupMode === 'safe' ? safe : aggressive;
        if (currentTargets.total > 0) {
          setStorageKeysCount(currentTargets.total);
          setUnusedSyncKeys(currentTargets.syncKeys);
          setUnusedLocalKeys(currentTargets.localKeys);
          setShowNotification(true);
        }
      } catch (error) {
        console.error('Error detecting old storage keys:', error);
      } finally {
        setIsDetecting(false);
      }
    };

    detectOldStorageKeys();
  }, [isVisible, cleanupMode]);

  // クリーンアップ実行処理
  const executeCleanup = async (targets: CleanupTargets) => {
    try {
      // Remove old keys
      if (targets.syncKeys.length > 0) {
        await Browser.storage.sync.remove(targets.syncKeys);
      }

      if (targets.localKeys.length > 0) {
        await Browser.storage.local.remove(targets.localKeys);
      }

      const totalRemoved = targets.syncKeys.length + targets.localKeys.length;
      const modeText = cleanupMode === 'safe' ? 'safe' : 'aggressive';
      toast.success(t(`Successfully removed ${totalRemoved} storage keys (${modeText} mode)`));
      setShowNotification(false);

      if (onCleanupComplete) {
        onCleanupComplete();
      }
    } catch (error) {
      console.error('Error cleaning up old storage:', error);
      toast.error(t('Error cleaning up old storage keys'));
    }
  };

  // クリーンアップ処理（確認ダイアログを表示）
  const handleCleanup = async () => {
    setShowConfirmDialog(true);
  };

  // 確認後のクリーンアップ実行
  const handleConfirmCleanup = async () => {
    setLoading(true);
    setShowConfirmDialog(false);

    try {
      const targets = await detectCleanupTargets(cleanupMode);
      await executeCleanup(targets);
    } catch (error) {
      console.error('Error in cleanup process:', error);
      toast.error(t('Error during cleanup process'));
    } finally {
      setLoading(false);
    }
  };

  // モード切り替え時の再検出
  const handleModeChange = async (newMode: CleanupMode) => {
    setCleanupMode(newMode);
    setDetailsLoading(true); // モード変更中は詳細を非表示にしてローディング表示

    // 少し遅延させてから対象を更新（UIの固まりを防ぐため）
    setTimeout(() => {
      const currentTargets = newMode === 'safe' ? safeTargets : aggressiveTargets;
      setStorageKeysCount(currentTargets.total);
      setUnusedSyncKeys(currentTargets.syncKeys);
      setUnusedLocalKeys(currentTargets.localKeys);
      setDetailsLoading(false);

      if (currentTargets.total === 0) {
        setShowNotification(false);
      }
    }, 50);
  };

  if (!showNotification) {
    return null;
  }

  return (
    <>
      {/* Invisible div for intersection observer */}
      <div ref={observerRef} className="h-0" />

      <div className="mx-10 mt-3 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  {t('Old storage data detected')}
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {t('Found {{count}} old/unused storage entries that can be cleaned up for better performance.', { count: storageKeysCount })}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="px-3 py-1.5 text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 dark:bg-yellow-800/50 dark:hover:bg-yellow-700/70 dark:text-yellow-200 rounded-lg transition-colors"
              >
                {showDetails ? t('Hide details') : t('Show details')}
              </button>
              <button
                onClick={handleCleanup}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('Cleaning...') : t('Remove Old Data')}
              </button>
            </div>
          </div>

          {/* クリーンアップモード選択 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {t('Cleanup Mode:')}
              </label>
              <select
                value={cleanupMode}
                onChange={(e) => handleModeChange(e.target.value as CleanupMode)}
                className="px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-yellow-300 dark:border-yellow-600 rounded text-yellow-800 dark:text-yellow-200"
              >
                <option value="safe">{t('Safe (Recommended)')}</option>
                <option value="aggressive">{t('Aggressive (Advanced)')}</option>
              </select>
            </div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">
              {cleanupMode === 'safe'
                ? t('Removes only known safe legacy keys')
                : t('Removes all keys except protected ones')
              }
            </div>
          </div>

          {showDetails && (
            <div className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg">
              {detailsLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-yellow-200 dark:bg-yellow-800 rounded w-32 animate-pulse"></div>
                  <div className="space-y-1">
                    <div className="h-3 bg-yellow-200 dark:bg-yellow-800 rounded w-48 animate-pulse"></div>
                    <div className="h-3 bg-yellow-200 dark:bg-yellow-800 rounded w-64 animate-pulse"></div>
                    <div className="h-3 bg-yellow-200 dark:bg-yellow-800 rounded w-56 animate-pulse"></div>
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">{t('Keys to be removed:')}</h4>

              {/* Safe Modeの対象キー */}
              {(safeTargets.syncKeys.length > 0 || safeTargets.localKeys.length > 0) && (
                <div className="mb-4">
                  <h5 className="font-medium text-green-700 dark:text-green-300 text-sm mb-2">
                    {t('Safe Mode (Default): {{count}} keys', { count: safeTargets.total })}
                  </h5>

                  {safeTargets.syncKeys.length > 0 && (
                    <div className="mb-2">
                      <h6 className="font-medium text-green-600 dark:text-green-400 text-xs mb-1">
                        {t('Sync Storage: {{count}} keys', { count: safeTargets.syncKeys.length })}
                      </h6>
                      <div className="max-h-24 overflow-y-auto">
                        {safeTargets.syncKeys.map(key => (
                          <div key={key} className="text-xs font-mono bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded mb-1 text-green-800 dark:text-green-200">
                            {key}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {safeTargets.localKeys.length > 0 && (
                    <div>
                      <h6 className="font-medium text-green-600 dark:text-green-400 text-xs mb-1">
                        {t('Local Storage: {{count}} keys', { count: safeTargets.localKeys.length })}
                      </h6>
                      <div className="max-h-24 overflow-y-auto">
                        {safeTargets.localKeys.map(key => (
                          <div key={key} className="text-xs font-mono bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded mb-1 text-green-800 dark:text-green-200">
                            {key}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aggressive Modeの対象キー（差分のみ） */}
              {(() => {
                const aggressiveOnly = getAggressiveOnlyTargets();
                return aggressiveOnly.total > 0;
              })() && (
                <div>
                  <h5 className="font-medium text-orange-700 dark:text-orange-300 text-sm mb-2">
                    {t('Aggressive Mode (Advanced): {{count}} keys', { count: getAggressiveOnlyTargets().total })}
                  </h5>

                  {(() => {
                    const aggressiveOnly = getAggressiveOnlyTargets();
                    return aggressiveOnly.syncKeys.length > 0;
                  })() && (
                    <div className="mb-2">
                      <h6 className="font-medium text-orange-600 dark:text-orange-400 text-xs mb-1">
                        {t('Sync Storage: {{count}} keys', { count: getAggressiveOnlyTargets().syncKeys.length })}
                      </h6>
                      <div className="max-h-24 overflow-y-auto">
                        {getAggressiveOnlyTargets().syncKeys.map(key => (
                          <div key={key} className="text-xs font-mono bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded mb-1 text-orange-800 dark:text-orange-200">
                            {key}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const aggressiveOnly = getAggressiveOnlyTargets();
                    return aggressiveOnly.localKeys.length > 0;
                  })() && (
                    <div>
                      <h6 className="font-medium text-orange-600 dark:text-orange-400 text-xs mb-1">
                        {t('Local Storage: {{count}} keys', { count: getAggressiveOnlyTargets().localKeys.length })}
                      </h6>
                      <div className="max-h-24 overflow-y-auto">
                        {getAggressiveOnlyTargets().localKeys.map(key => (
                          <div key={key} className="text-xs font-mono bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded mb-1 text-orange-800 dark:text-orange-200">
                            {key}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {safeTargets.total === 0 && aggressiveTargets.total === 0 && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  {t('No keys to remove')}
                </p>
              )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 確認ダイアログ */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              {cleanupMode === 'safe' ? t('Confirm Safe Cleanup') : t('Confirm Aggressive Cleanup')}
            </h3>

            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {cleanupMode === 'safe'
                  ? t('This will remove known safe legacy keys that are no longer needed.')
                  : t('This will remove all keys except protected ones. This may reset some settings.')
                }
              </p>

              <div className="text-sm text-gray-700 dark:text-gray-300">
                <p className="font-medium mb-2">
                  {t('Keys to be removed: {{count}}', { count: storageKeysCount })}
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {unusedSyncKeys.length > 0 && (
                    <li>{t('Sync storage: {{count}} keys', { count: unusedSyncKeys.length })}</li>
                  )}
                  {unusedLocalKeys.length > 0 && (
                    <li>{t('Local storage: {{count}} keys', { count: unusedLocalKeys.length })}</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded-lg transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleConfirmCleanup}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                {cleanupMode === 'safe' ? t('Safe Cleanup') : t('Aggressive Cleanup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OldStorageNotification;