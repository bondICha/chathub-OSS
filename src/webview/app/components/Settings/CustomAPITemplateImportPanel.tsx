import { FC, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BiImport, BiChevronDown, BiChevronRight } from 'react-icons/bi'
import { fileOpen } from 'browser-fs-access'
import { isEqual, omit } from 'lodash-es'
import Button from '../Button'
import Dialog from '../Dialog'
import Select from '../Select'
import Checkbox from '../Checkbox'
import { UserConfig, CustomApiConfig, updateUserConfig, ProviderConfig } from '~services/user-config'
import { setCompanyProfileState, CompanyProfileStatus, findCompanyPresetByName } from '~services/company-profile'
import { requestHostPermissions } from '~services/host-permissions'
import toast from 'react-hot-toast'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
  autoImportTemplate?: string // 自動インポート用のテンプレートパス
  companyName?: string // 会社名
}

// インポートデータ用の型定義（previousNamesを含む）
type ImportedCustomApiConfig = CustomApiConfig & { previousNames?: string[] };

// Helper function to parse imported template data (simplified: supports only current format)
const _parseImportedTemplateData = (jsonData: any): { configs: ImportedCustomApiConfig[], providerConfigs?: ProviderConfig[], commonSystemMessage?: string } => {
  if (!Array.isArray(jsonData.customApiConfigs)) {
    return { configs: [], providerConfigs: undefined, commonSystemMessage: undefined };
  }
  return {
    configs: [...jsonData.customApiConfigs],
    providerConfigs: Array.isArray(jsonData.providerConfigs) ? jsonData.providerConfigs : undefined,
    commonSystemMessage: typeof jsonData.commonSystemMessage === 'string' ? jsonData.commonSystemMessage : undefined,
  };
};

// Helper function to compare two configs
const isConfigEqual = (config1: ImportedCustomApiConfig, config2: CustomApiConfig): boolean => {
  const c1 = omit(config1, ['id', 'enabled', 'previousNames']);
  const c2 = omit(config2, ['id', 'enabled']);
  return isEqual(c1, c2);
};

// Helper function to compare two provider configs
const isProviderConfigEqual = (config1: ProviderConfig, config2: ProviderConfig): boolean => {
  // IDとAPIキーは比較対象外
  const c1 = omit(config1, ['apiKey']);
  const c2 = omit(config2, ['apiKey']);
  return isEqual(c1, c2);
};

const DiffTable: FC<{ importConfig: any; existingConfig?: any }> = ({ importConfig, existingConfig }) => {
  const { t } = useTranslation();
  
  // 全てのキーを取得
  const allKeys = Array.from(new Set([
    ...Object.keys(importConfig),
    ...(existingConfig ? Object.keys(existingConfig) : [])
  ])).sort();

  // 除外するキー
  const ignoredKeys = ['id', 'enabled', 'previousNames', 'apiKey'];

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
      <table className="w-full text-xs text-left">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-3 py-2 w-1/4">{t('Property')}</th>
            <th className="px-3 py-2 w-1/3">{t('Import Value')}</th>
            <th className="px-3 py-2 w-1/3">{t('Existing Value')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
          {allKeys.filter(key => !ignoredKeys.includes(key)).map(key => {
            const importVal = importConfig[key];
            const existingVal = existingConfig ? existingConfig[key] : undefined;
            const isDifferent = existingConfig && !isEqual(importVal, existingVal);
            
            // 値を文字列化して表示
            const formatValue = (val: any, k: string) => {
              if (k === 'apiKey') return '********'; // APIキーはマスク
              if (val === undefined) return <span className="text-gray-400 italic">undefined</span>;
              if (val === null) return <span className="text-gray-400 italic">null</span>;
              if (typeof val === 'object') return JSON.stringify(val);
              return String(val);
            };

            return (
              <tr key={key} className={isDifferent ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{key}</td>
                <td className={`px-3 py-2 font-mono break-all ${isDifferent ? 'text-yellow-700 dark:text-yellow-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                  {formatValue(importVal, key)}
                </td>
                <td className="px-3 py-2 font-mono break-all text-gray-700 dark:text-gray-300">
                  {existingConfig ? formatValue(existingVal, key) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const CustomAPITemplateImportPanel: FC<Props> = ({ userConfig, updateConfigValue, autoImportTemplate, companyName }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [importedData, setImportedData] = useState<{ configs: ImportedCustomApiConfig[], providerConfigs?: ProviderConfig[], commonSystemMessage?: string }>({ configs: [] });
  const [mappings, setMappings] = useState<number[]>([])
  const [lastOpenedFile, setLastOpenedFile] = useState<Blob | null>(null);
  // Common要素のインポート選択状態（デフォルトはON）
  const [importProviderConfigs, setImportProviderConfigs] = useState(true);
  const [importCommonSystemMessage, setImportCommonSystemMessage] = useState(true);
  // 個別Provider選択状態
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [expandProviders, setExpandProviders] = useState(false);
  const [expandedPreviews, setExpandedPreviews] = useState<Record<number, boolean>>({});
  const [expandedProviderPreviews, setExpandedProviderPreviews] = useState<Record<string, boolean>>({});

  const togglePreview = (index: number) => {
    setExpandedPreviews(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const toggleProviderPreview = (id: string) => {
    setExpandedProviderPreviews(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // インポートデータと既存設定のマッチング情報を計算
  const matchedIndices = useMemo(() => {
    return importedData.configs.map(importConfig => {
      // 1. 名前とモデルで完全一致検索
      let existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name && c.model === importConfig.model);
      
      // 2. 名前のみで検索（モデル更新）
      if (existingIndex === -1) {
        existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name);
      }

      // 3. 旧名称で検索（名称変更）
      if (existingIndex === -1 && importConfig.previousNames && importConfig.previousNames.length > 0) {
        existingIndex = userConfig.customApiConfigs.findIndex(c => importConfig.previousNames?.includes(c.name));
      }
      
      return existingIndex;
    });
  }, [importedData.configs, userConfig.customApiConfigs]);

  // 自動テンプレートインポート処理
  const handleAutoImport = async (companyName: string) => {
    try {
      const preset = await findCompanyPresetByName(companyName);
      if (!preset) {
        throw new Error('Company preset not found');
      }

      const { configs: parsedConfigs, providerConfigs: parsedProviderConfigs, commonSystemMessage: parsedCommonSystemMessage } = _parseImportedTemplateData(preset.templateData);
 
      if (parsedConfigs.length === 0) {
        toast.error(t('No Custom API settings found in the file. Please check the file format.'));
        return;
      }

      // チェックボックスの状態をリセット（デフォルトはON）
      setImportProviderConfigs(true);
      setImportCommonSystemMessage(true);
      
      // Providerの差分チェックと初期選択
      const initialSelectedProviders: string[] = [];
      if (parsedProviderConfigs) {
        const existingProviders = userConfig.providerConfigs || [];
        parsedProviderConfigs.forEach(p => {
          // IDで検索、なければHostとProviderで検索
          let existing = existingProviders.find(ep => ep.id === p.id);
          if (!existing) {
            // Hostの末尾スラッシュを無視して比較
            const normalizeHost = (h: string) => h.endsWith('/') ? h.slice(0, -1) : h;
            existing = existingProviders.find(ep => normalizeHost(ep.host) === normalizeHost(p.host) && ep.provider === p.provider);
          }

          if (!existing) {
            // 新規は選択
            initialSelectedProviders.push(p.id);
          } else if (!isProviderConfigEqual(p, existing)) {
            // 差分ありは選択
            initialSelectedProviders.push(p.id);
          }
          // 完全一致は選択しない
        });
      }
      setSelectedProviders(initialSelectedProviders);
      setExpandProviders(false);
 
      // デフォルト値上書きロジック：名前とモデルでマッチングし、差分がある場合のみ上書き
      const defaultMappings = parsedConfigs.map((importConfig) => {
        // 1. 名前とモデルで完全一致検索
        let existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name && c.model === importConfig.model);
        
        // 2. 名前のみで検索（モデル更新）
        if (existingIndex === -1) {
          existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name);
        }

        // 3. 旧名称で検索（名称変更）
        if (existingIndex === -1 && importConfig.previousNames && importConfig.previousNames.length > 0) {
          existingIndex = userConfig.customApiConfigs.findIndex(c => importConfig.previousNames?.includes(c.name));
        }

        if (existingIndex !== -1) {
          // 既存の設定が見つかった場合、内容を比較
          const existingConfig = userConfig.customApiConfigs[existingIndex];
          if (isConfigEqual(importConfig, existingConfig)) {
            return -1; // 完全に一致する場合はインポートしない
          } else {
            return existingIndex; // 差分がある場合は上書き
          }
        } else {
          return -2; // 新規追加
        }
      });

      setImportedData({ configs: parsedConfigs, providerConfigs: parsedProviderConfigs, commonSystemMessage: parsedCommonSystemMessage });
      setMappings(defaultMappings);
      setIsOpen(true);

    } catch (error: any) {
      console.error('Error processing auto import template:', error);
      toast.error(t('Failed to process template: ') + error.message);
    }
  };

  // 自動インポートのuseEffect
  useEffect(() => {
    if (autoImportTemplate === 'templateData' && companyName) {
      handleAutoImport(companyName);
    }
  }, [autoImportTemplate, companyName]);


  // ファイル選択処理
  const handleFileSelect = async () => {
    try {
      const blob = await fileOpen({ extensions: ['.json'] })
      setLastOpenedFile(blob);
      const text = await blob.text()
      const json = JSON.parse(text);

      const { configs: parsedConfigs, providerConfigs: parsedProviderConfigs, commonSystemMessage: parsedCommonSystemMessage } = _parseImportedTemplateData(json);
 
      if (parsedConfigs.length === 0) {
        toast.error(t('No Custom API settings found in the file. Please check the file format.'));
        return;
      }

      // チェックボックスの状態をリセット（デフォルトはON）
      setImportProviderConfigs(true);
      setImportCommonSystemMessage(true);
      
      // Providerの差分チェックと初期選択
      const initialSelectedProviders: string[] = [];
      if (parsedProviderConfigs) {
        const existingProviders = userConfig.providerConfigs || [];
        parsedProviderConfigs.forEach(p => {
          // IDで検索、なければHostとProviderで検索
          let existing = existingProviders.find(ep => ep.id === p.id);
          if (!existing) {
            // Hostの末尾スラッシュを無視して比較
            const normalizeHost = (h: string) => h.endsWith('/') ? h.slice(0, -1) : h;
            existing = existingProviders.find(ep => normalizeHost(ep.host) === normalizeHost(p.host) && ep.provider === p.provider);
          }

          if (!existing) {
            // 新規は選択
            initialSelectedProviders.push(p.id);
          } else if (!isProviderConfigEqual(p, existing)) {
            // 差分ありは選択
            initialSelectedProviders.push(p.id);
          }
          // 完全一致は選択しない
        });
      }
      setSelectedProviders(initialSelectedProviders);
      setExpandProviders(false);
 
      // 既存Bot数以下は上書き、超過時は「Add as new」
      const defaultMappings = parsedConfigs.map((importConfig) => {
        // 1. 名前とモデルで完全一致検索
        let existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name && c.model === importConfig.model);
        
        // 2. 名前のみで検索（モデル更新）
        if (existingIndex === -1) {
          existingIndex = userConfig.customApiConfigs.findIndex(c => c.name === importConfig.name);
        }

        // 3. 旧名称で検索（名称変更）
        if (existingIndex === -1 && importConfig.previousNames && importConfig.previousNames.length > 0) {
          existingIndex = userConfig.customApiConfigs.findIndex(c => importConfig.previousNames?.includes(c.name));
        }
        
        if (existingIndex !== -1) {
          // 既存の設定が見つかった場合、内容を比較
          const existingConfig = userConfig.customApiConfigs[existingIndex];
          if (isConfigEqual(importConfig, existingConfig)) {
            return -1; // 完全に一致する場合はインポートしない
          } else {
            return existingIndex; // 差分がある場合は上書き
          }
        } else {
          return -2; // 新規追加
        }
      });

      setImportedData({ configs: parsedConfigs, providerConfigs: parsedProviderConfigs, commonSystemMessage: parsedCommonSystemMessage });
      setMappings(defaultMappings);
      setIsOpen(true);

    } catch (error: any) {
      console.error('Error processing file for import:', error);
      toast.error(t('Failed to process file: ') + error.message);
      setLastOpenedFile(null);
    }
  }

  // インポート実行
  const handleImport = async () => {
    try {
      const confirmMessage = t(
        'Selected Custom API settings will be imported. This will overwrite existing settings including individual API keys. Common API Key will be preserved. Continue?'
      );
      if (!window.confirm(confirmMessage)) {
        return;
      }

      const newConfigs = [...userConfig.customApiConfigs];
      const configsToAdd: CustomApiConfig[] = [];

      importedData.configs.forEach((config, index) => {
        const targetIndex = mappings[index];
        // previousNamesを削除した新しいオブジェクトを作成
        const configToSave = omit(config, ['previousNames']) as CustomApiConfig;

        if (targetIndex === -2) { // Add as new
          const newIndex = newConfigs.length + configsToAdd.length;
          // Respect template's enabled flag: profiles marked enabled:false load as disabled by default
          configsToAdd.push({
            ...configToSave,
            id: newIndex + 1, // Assign new ID
            enabled: configToSave.enabled ?? true,
          });
        } else if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < newConfigs.length) { // Overwrite existing
          // Preserve user's existing enabled state on overwrite
          newConfigs[targetIndex] = {
            ...configToSave,
            id: newConfigs[targetIndex].id, // Preserve original ID
            enabled: newConfigs[targetIndex].enabled ?? true,
          };
        }
      });

      const updatedConfigs = [...newConfigs, ...configsToAdd];
      const updatePayload: Partial<UserConfig> = { customApiConfigs: updatedConfigs };

      if (importedData.providerConfigs && importProviderConfigs && selectedProviders.length > 0) {
        // 既存のProviderConfigsを取得（存在しない場合は空配列）
        const existingProviders = userConfig.providerConfigs || [];
        
        // 選択されたProviderのみをインポート
        const filteredProviders = importedData.providerConfigs.filter(p => selectedProviders.includes(p.id));
        
        // マージロジック: 同じIDがあれば上書き、なければ追加
        const mergedProviders = [...existingProviders];
        const idMap: Record<string, string> = {}; // 旧ID -> 新ID のマップ

        filteredProviders.forEach(newProvider => {
          // IDで検索
          let existingIndex = mergedProviders.findIndex(p => p.id === newProvider.id);
          
          // IDで見つからない場合、HostとProviderで検索
          if (existingIndex === -1) {
            const normalizeHost = (h: string) => h.endsWith('/') ? h.slice(0, -1) : h;
            existingIndex = mergedProviders.findIndex(p => normalizeHost(p.host) === normalizeHost(newProvider.host) && p.provider === newProvider.provider);
            if (existingIndex >= 0) {
              // IDが異なるが内容が一致するProviderが見つかった場合
              // 旧IDを記録し、新IDで上書きする
              idMap[mergedProviders[existingIndex].id] = newProvider.id;
            }
          }

          if (existingIndex >= 0) {
            // 既存のProviderを上書き（IDも更新される）
            // ただし、APIキーは既存のものを保持する（インポートデータにAPIキーがない場合）
            const existingApiKey = mergedProviders[existingIndex].apiKey;
            mergedProviders[existingIndex] = {
              ...newProvider,
              apiKey: newProvider.apiKey || existingApiKey // インポートデータのAPIキーが空なら既存のものを使う
            };
          } else {
            // 新しいProviderとして追加
            mergedProviders.push(newProvider);
          }
        });
        
        updatePayload.providerConfigs = mergedProviders;

        // IDが変更された場合、Chatbot設定の参照IDも更新する
        if (Object.keys(idMap).length > 0) {
          // updatePayload.customApiConfigs は既に更新されている可能性があるため、そちらを優先
          const configsToUpdate = updatePayload.customApiConfigs || [...userConfig.customApiConfigs];
          
          configsToUpdate.forEach(config => {
            if (config.providerRefId && idMap[config.providerRefId]) {
              config.providerRefId = idMap[config.providerRefId];
            }
          });
          
          updatePayload.customApiConfigs = configsToUpdate;
        }
      }
 
      if (importedData.commonSystemMessage !== undefined && importCommonSystemMessage) {
        updatePayload.commonSystemMessage = importedData.commonSystemMessage;
      }

      await updateUserConfig(updatePayload);
      updateConfigValue(updatePayload);

      // 会社プロファイルのImportが実行された場合、状態を「Import済み」に更新
      if (companyName) {
        const preset = await findCompanyPresetByName(companyName);
        if (preset) {
          await setCompanyProfileState({
            companyName: preset.companyName,
            version: preset.version,
            status: CompanyProfileStatus.IMPORTED,
            lastChecked: Date.now(),
            checkCount: 0
          });
        }
      }

      // Request host permissions for imported API hosts
      await requestHostPermissions(updatedConfigs, (updatePayload.providerConfigs || userConfig.providerConfigs) || []);

      toast.success(t('Custom API settings imported successfully'));
      setIsOpen(false);
      setLastOpenedFile(null); // 正常終了後リセット

    } catch (error: any) {
      console.error('Error applying import:', error);
      toast.error(t('Failed to apply imported settings: ') + error.message);
      // エラー時、元の設定に戻す処理は updateConfigValue を使って行う
      updateConfigValue({
        customApiConfigs: userConfig.customApiConfigs || [],
        customApiHost: userConfig.customApiHost,
        commonSystemMessage: userConfig.commonSystemMessage,
        providerConfigs: userConfig.providerConfigs
      });
    }
  };

  return (
    <>
      <Button
        size="normal"
        text={t('Import Template')}
        icon={<BiImport />}
        onClick={handleFileSelect}
        color="flat"
        className="flex-1 justify-center"
      />

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('Import Custom API Template')}
        className="w-full max-w-4xl max-h-[85vh]"
      >
        <div className="flex flex-col h-full max-h-[85vh]">
          
          <div className="flex-1 overflow-y-scroll px-6 py-3 min-h-0 max-h-[calc(85vh-100px)]">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-secondary-text">
                  {t('Select which models to import and where to place them. Individual API keys will be overwritten, but common API key will be preserved.')}
                </p>
              </div>

              {/* Common要素のインポート選択 */}
              {(importedData.providerConfigs || importedData.commonSystemMessage !== undefined) && (
                <div className="border-t border-primary-border pt-3">
                  <h4 className="text-sm font-medium mb-2 text-primary-text">{t('Common Settings')}</h4>
                  <div className="space-y-2">
                    {importedData.providerConfigs && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            label={t('Import API Providers') + ` (${selectedProviders.length}/${importedData.providerConfigs.length})`}
                            checked={importProviderConfigs}
                            onChange={(checked) => {
                              setImportProviderConfigs(checked);
                              if (checked) {
                                // 全選択
                                setSelectedProviders(importedData.providerConfigs?.map(p => p.id) || []);
                              } else {
                                // 全解除
                                setSelectedProviders([]);
                              }
                            }}
                          />
                          {importProviderConfigs && (
                            <button
                              onClick={() => setExpandProviders(!expandProviders)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              {expandProviders ? t('Hide details') : t('Show details')}
                            </button>
                          )}
                        </div>
                        {importProviderConfigs && expandProviders && (
                          <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-3">
                            {importedData.providerConfigs.map((provider) => {
                              // IDで検索、なければHostとProviderで検索
                              let existing = (userConfig.providerConfigs || []).find(p => p.id === provider.id);
                              if (!existing) {
                                const normalizeHost = (h: string) => h.endsWith('/') ? h.slice(0, -1) : h;
                                existing = (userConfig.providerConfigs || []).find(p => normalizeHost(p.host) === normalizeHost(provider.host) && p.provider === provider.provider);
                              }
                              
                              const isIdentical = existing && isProviderConfigEqual(provider, existing);
                              const isExpanded = expandedProviderPreviews[provider.id];
                              
                              return (
                                <div key={provider.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 pb-1">
                                  <div className="flex items-center justify-between pr-2">
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        label={provider.name}
                                        checked={selectedProviders.includes(provider.id)}
                                        disabled={!!isIdentical}
                                        onChange={(checked) => {
                                          if (checked) {
                                            setSelectedProviders([...selectedProviders, provider.id]);
                                          } else {
                                            setSelectedProviders(selectedProviders.filter(id => id !== provider.id));
                                          }
                                        }}
                                        className={isIdentical ? "opacity-50" : ""}
                                      />
                                      <button
                                        onClick={() => toggleProviderPreview(provider.id)}
                                        className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                      >
                                        {isExpanded ? <BiChevronDown /> : <BiChevronRight />}
                                        {isExpanded ? t('Hide Details') : t('Show Details')}
                                      </button>
                                    </div>
                                    {isIdentical && (
                                      <span className="text-xs text-secondary-text italic">
                                        {t('Identical to existing')}
                                      </span>
                                    )}
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-2 mb-2 pl-6">
                                      <DiffTable importConfig={provider} existingConfig={existing} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {importedData.commonSystemMessage !== undefined && (
                      <Checkbox
                        label={t('Import Common System Message')}
                        checked={importCommonSystemMessage}
                        onChange={setImportCommonSystemMessage}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Column headers */}
              <div className="flex items-center gap-6 mb-2 py-2 border-b border-primary-border">
                <div className="w-1/3">
                  <h4 className="text-sm font-medium text-primary-text">{t('Import ChatBot Settings')}</h4>
                </div>
                <div className="w-1/6"></div>
                <div className="w-1/2">
                  <h4 className="text-sm font-medium text-primary-text">{t('Override Chatbot')}</h4>
                </div>
              </div>

              {/* ChatBot configurations list */}
              {importedData.configs.map((importConfig, index) => {
                const targetIndex = mappings[index];
                // 選択されたターゲット設定、または自動マッチングされた設定を取得
                const matchedIndex = matchedIndices[index];
                const existingConfig = targetIndex >= 0 
                  ? userConfig.customApiConfigs[targetIndex] 
                  : (matchedIndex !== -1 ? userConfig.customApiConfigs[matchedIndex] : undefined);
                
                const isIdentical = existingConfig && isConfigEqual(importConfig, existingConfig);
                const isExpanded = expandedPreviews[index];

                return (
                  <div key={index} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
                    <div className="flex items-center gap-6 py-3">
                      <div className="w-1/3 flex flex-col gap-2">
                        <div>
                          <p className="font-medium text-primary-text">{importConfig.name}</p>
                          <p className="text-xs text-secondary-text mt-1">{importConfig.model}</p>
                        </div>
                        <button
                          onClick={() => togglePreview(index)}
                          className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline w-fit"
                        >
                          {isExpanded ? <BiChevronDown /> : <BiChevronRight />}
                          {isExpanded ? t('Hide Details') : t('Show Details')}
                        </button>
                      </div>
                      <div className="w-1/6 text-center text-lg text-secondary-text">→</div>
                      <div className="w-1/2">
                        <div className="flex flex-col gap-1 w-full">
                          <Select
                            options={[
                              { name: t('Do not import'), value: '-1' },
                              { name: t('Add as new'), value: '-2' },
                              ...userConfig.customApiConfigs.map((config, i) => ({
                                name: `${i + 1}: ${config.name}`,
                                value: String(i)
                              }))
                            ]}
                            value={String(mappings[index])}
                            onChange={(v) => {
                              const newValue = parseInt(v, 10)
                              const newMappings = [...mappings]

                              if (newValue >= 0) {
                                const duplicateIndex = newMappings.findIndex(
                                  (mapping, i) => i !== index && mapping === newValue
                                )
                                if (duplicateIndex !== -1) {
                                  newMappings[duplicateIndex] = -1
                                }
                              }
                              newMappings[index] = newValue
                              setMappings(newMappings)
                            }}
                          />
                          {mappings[index] === -1 && isIdentical && (
                            <p className="text-xs text-secondary-text italic">
                              {t('Identical settings found. Skipped by default.')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="pl-4 pr-4 pb-4">
                        <DiffTable importConfig={importConfig} existingConfig={existingConfig} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="px-6 py-3 flex-shrink-0 border-t border-primary-border">
            <div className="flex justify-end gap-4">
              <Button text={t('Cancel')} onClick={() => setIsOpen(false)} color="flat" />
              <Button text={t('Import')} onClick={handleImport} color="primary" />
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}

export default CustomAPITemplateImportPanel
