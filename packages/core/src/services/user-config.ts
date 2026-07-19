import { defaults } from 'lodash-es'
import toast from 'react-hot-toast';
import Browser from 'webextension-polyfill'
import {
  ALL_IN_ONE_PAGE_ID, CHATGPT_API_MODELS,
  CHATBOTS_UPDATED_EVENT, DEFAULT_SYSTEM_MESSAGE
} from '~app/consts'
export { MODEL_LIST } from '../../config/model-list'

// Import types for use in this file
import {
  SystemPromptMode,
  FontType,
  CustomApiProvider,
  OPENAI_COMPATIBLE_PROVIDERS,
  CLAUDE_COMPATIBLE_PROVIDERS,
  THINKING_BUDGET_PROVIDERS,
  IMAGE_ONLY_PROVIDERS,
  PROVIDER_INFO,
  type ModelInfo,
  type AdvancedConfig,
  type ProviderConfig,
  type ToolDefinition,
  type ImageFunctionToolSettings,
  type AgenticImageBotSettings,
  type CustomApiConfig,
  type ChatPair,
} from './user-config/types'

// Re-export all types for external use
export * from './user-config/types'

// カスタムモデルの最大数
const MAX_CUSTOM_MODELS = 50;

// カスタムAPIの設定キーのプレフィックス
const CUSTOM_API_CONFIG_PREFIX = 'customApiConfig_';

/**
 * デフォルトのカスタムAPI設定
 */
const defaultCustomApiConfigs: CustomApiConfig[] = [

]



/**
 * デフォルトのユーザー設定
 */
const userConfigWithDefaultValue = {
  startupPage: ALL_IN_ONE_PAGE_ID,
  chatgptWebAccess: false,
  claudeWebAccess: false,
  customApiConfigs: defaultCustomApiConfigs,
  providerConfigs: [] as ProviderConfig[], // API Provider設定
  customApiKey: '',
  customApiHost: '',
  commonSystemMessage: DEFAULT_SYSTEM_MESSAGE as string,
  isCustomApiHostFullPath: false, // デフォルト値を設定
  savedChatPairs: [] as ChatPair[], // 保存されたチャットペア
  fontType: FontType.SERIF, // フォントタイプ（デフォルト: Sans-serif）
  titleGenerationBotIndex: undefined as number | undefined, // タイトル生成に使用するボットのインデックス（undefined = 生成しない）
  titleLanguage: 'ja' as 'ja' | 'zh', // タイトル生成言語（日本語 or 中国語）
  titleUpdateEveryTurn: false, // 毎回のチャット毎にタイトルを更新するか（デフォルト: 初回のみ）
  aiTitlePromptDismissed: false, // 起動時のAI Title Generationプロンプトを非表示にしたか
}

export type UserConfig = typeof userConfigWithDefaultValue



/**
 * ユーザー設定を取得する
 * @returns ユーザー設定
 */
// Helper function to migrate customApiConfigs from sync to local
async function _migrateCustomApiConfigsFromSyncToLocal(): Promise<CustomApiConfig[] | undefined> {
  const allSyncDataForMigration = await Browser.storage.sync.get(null);
  const oldIndividualConfigKeys = Object.keys(allSyncDataForMigration)
    .filter(key => key.startsWith(CUSTOM_API_CONFIG_PREFIX));

  if (oldIndividualConfigKeys.length > 0) {
    console.log('Migrating customApiConfigs from sync (individual keys) to local (single key)...');
    let migratedConfigs: CustomApiConfig[] = [];
    for (const key of oldIndividualConfigKeys) {
      if (allSyncDataForMigration[key] && typeof allSyncDataForMigration[key] === 'object') {
        migratedConfigs.push(allSyncDataForMigration[key] as CustomApiConfig);
      }
    }
    // Sort by index extracted from the key
    migratedConfigs.sort((a, b) => {
      const getIndexFromKey = (config: CustomApiConfig, keyPrefix: string, allData: Record<string, any>): number => {
        for (const k in allData) {
          if (allData[k] === config && k.startsWith(keyPrefix)) {
            const indexStr = k.substring(keyPrefix.length);
            const index = parseInt(indexStr, 10);
            if (!isNaN(index)) return index;
          }
        }
        return Infinity;
      };
      const indexA = getIndexFromKey(a, CUSTOM_API_CONFIG_PREFIX, allSyncDataForMigration);
      const indexB = getIndexFromKey(b, CUSTOM_API_CONFIG_PREFIX, allSyncDataForMigration);
      return indexA - indexB;
    });

    await Browser.storage.local.set({ customApiConfigs: migratedConfigs });
    await Browser.storage.sync.remove(oldIndividualConfigKeys);
    console.log('Migration complete.');
    return migratedConfigs;
  }
  return undefined;
}

export async function getUserConfig(): Promise<UserConfig> {
  try {
    // 1. Local storage から取得する項目 (端末固有の設定)
    const localKeys = ['customApiConfigs', 'savedChatPairs'];
    const localData = await Browser.storage.local.get(localKeys);
    let customConfigsInLocal: CustomApiConfig[] | undefined = localData.customApiConfigs;
    let chatPairsInLocal: ChatPair[] | undefined = localData.savedChatPairs;

    // 2. その他の設定を sync から取得
    const syncKeysToGet = Object.keys(userConfigWithDefaultValue).filter(k => !localKeys.includes(k));
    const syncData = await Browser.storage.sync.get(syncKeysToGet);

    let finalConfig = defaults({}, syncData, userConfigWithDefaultValue);

    // 3. マイグレーション処理 (必要な場合)
    if (customConfigsInLocal === undefined || (Array.isArray(customConfigsInLocal) && customConfigsInLocal.length === 0)) {
      const migrated = await _migrateCustomApiConfigsFromSyncToLocal();
      if (migrated) {
        customConfigsInLocal = migrated;
      }
    }

    finalConfig.customApiConfigs = customConfigsInLocal || [...defaultCustomApiConfigs];
    finalConfig.providerConfigs = syncData.providerConfigs || [];
    finalConfig.savedChatPairs = chatPairsInLocal || [];
    
    if (finalConfig.customApiConfigs) {
      finalConfig.customApiConfigs.forEach((config: CustomApiConfig) => {
        if (config.isHostFullPath === undefined) {
          config.isHostFullPath = false; // マイグレーション: 既存設定にデフォルト値を設定
        }
        if (config.systemPromptMode === undefined) {
          config.systemPromptMode = SystemPromptMode.OVERRIDE; // マイグレーション: 既存設定にデフォルト値を設定
        }

        // Note: Legacy image field migrations removed
        // Users with old OpenAI_Image settings will get defaults (acceptable per requirements)

        // Migration: Unify web search fields into providerWebSearch
        if (config.providerWebSearch === undefined) {
          // Priority: webToolSupport > provider-specific fields
          if (typeof config.webToolSupport === 'boolean') {
            config.providerWebSearch = config.webToolSupport;
          } else {
            // Provider-specific logic
            switch (config.provider) {
              case CustomApiProvider.OpenAI_Responses:
                config.providerWebSearch = config.responsesWebSearch !== false;
                break;
              case CustomApiProvider.Anthropic:
              case CustomApiProvider.VertexAI_Claude:
              case CustomApiProvider.Google:
                config.providerWebSearch = !!config.webAccess;
                break;
              default:
                config.providerWebSearch = false;
            }
          }
        }
      });
    }
    
    if (syncData.enabledBots && Array.isArray(syncData.enabledBots) && finalConfig.customApiConfigs) {
        finalConfig.customApiConfigs.forEach((config: CustomApiConfig, index: number) => {
        if (config.enabled === undefined) {
          config.enabled = syncData.enabledBots.includes(index);
        }
      });
      await Browser.storage.sync.remove('enabledBots');
    }

    // Migration for providerConfigs
    if ((!finalConfig.providerConfigs || finalConfig.providerConfigs.length === 0) && finalConfig.customApiKey) {
      const defaultProvider: ProviderConfig = {
        id: 'default-provider',
        name: 'Default Provider',
        provider: CustomApiProvider.OpenAI,
        host: finalConfig.customApiHost || 'https://api.openai.com',
        isHostFullPath: finalConfig.isCustomApiHostFullPath || false,
        apiKey: finalConfig.customApiKey,
        icon: 'openai',
      };
      finalConfig.providerConfigs = [defaultProvider];
      finalConfig.customApiConfigs.forEach(config => {
        if (!config.host && !config.apiKey) {
          config.providerRefId = defaultProvider.id;
        }
      });
      // Clean up old common settings
      finalConfig.customApiKey = '';
      finalConfig.customApiHost = '';
      finalConfig.isCustomApiHostFullPath = false;
      
      await updateUserConfig({
        providerConfigs: finalConfig.providerConfigs,
        customApiConfigs: finalConfig.customApiConfigs,
        customApiKey: finalConfig.customApiKey,
        customApiHost: finalConfig.customApiHost,
        isCustomApiHostFullPath: finalConfig.isCustomApiHostFullPath,
      });
    }
    
    if (finalConfig.hasOwnProperty('useCustomChatbotOnly')) {
        delete (finalConfig as any).useCustomChatbotOnly;
        await Browser.storage.sync.remove('useCustomChatbotOnly');
    }

    return finalConfig;
  } catch (error) {
    console.error('Failed to get user config:', error);
    toast.error('設定の読み込みに失敗しました。デフォルト設定を使用します。');
    return { ...userConfigWithDefaultValue };
  }
}

/**
 * ユーザー設定を更新する
 * @param updates 更新する設定
 */
export async function updateUserConfig(updates: Partial<UserConfig>) {
  try {
    const { customApiConfigs, providerConfigs, savedChatPairs, ...otherUpdates } = updates;

    // 1. Local storage に保存する項目 (端末固有の設定)
    const localUpdates: Record<string, any> = {};

    // customApiConfigs を local に保存
    if (customApiConfigs !== undefined) {
      if (Array.isArray(customApiConfigs)) {
        localUpdates.customApiConfigs = customApiConfigs.slice(0, MAX_CUSTOM_MODELS);
      } else {
        localUpdates.customApiConfigs = [];
      }
    }

    // savedChatPairs を local に保存 (端末ごとの設定)
    if (savedChatPairs !== undefined) {
      if (Array.isArray(savedChatPairs)) {
        localUpdates.savedChatPairs = savedChatPairs;
      } else {
        localUpdates.savedChatPairs = [];
      }
    }

    if (Object.keys(localUpdates).length > 0) {
      await Browser.storage.local.set(localUpdates);
    }

    // 2. providerConfigs を sync に保存 (存在する場合)
    if (providerConfigs !== undefined) {
      if (Array.isArray(providerConfigs)) {
        await Browser.storage.sync.set({ providerConfigs });
      } else {
        await Browser.storage.sync.set({ providerConfigs: [] });
      }
    }

    // 3. その他の設定を sync に保存 (存在する場合)
    if (Object.keys(otherUpdates).length > 0) {
      const updatesForSync: Record<string, any> = {};
      const keysToRemoveFromSync: string[] = [];

      for (const [key, value] of Object.entries(otherUpdates)) {
        if (value === undefined) {
          keysToRemoveFromSync.push(key);
        } else {
          updatesForSync[key] = value;
        }
      }
      if (Object.keys(updatesForSync).length > 0) {
        await Browser.storage.sync.set(updatesForSync);
      }
      if (keysToRemoveFromSync.length > 0) {
        await Browser.storage.sync.remove(keysToRemoveFromSync);
      }
    }
    

    const event = new CustomEvent(CHATBOTS_UPDATED_EVENT);
    window.dispatchEvent(event);
  } catch (error) {
    console.error('Failed to update user config:', error);
    let errorMessage = '設定の保存に失敗しました';
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }
    toast.error(errorMessage);
  }
}

/**
 * チャットペアを保存する
 * @param botIndices 保存するボットのインデックス配列
 * @param customName カスタム名（省略時は自動生成）
 * @returns 保存されたチャットペア
 */
export async function saveChatPair(botIndices: number[], customName?: string): Promise<ChatPair> {
  const config = await getUserConfig();
  const allBots = config.customApiConfigs || [];

  // デフォルト名を生成（各ショートネームを|で区切る）
  const defaultName = botIndices
    .map(index => {
      const bot = allBots[index];
      return bot?.shortName || bot?.name || `Bot ${index + 1}`;
    })
    .join(' | ');

  const newPair: ChatPair = {
    id: `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: customName || defaultName,
    botIndices: [...botIndices],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const updatedPairs = [...(config.savedChatPairs || []), newPair];
  await updateUserConfig({ savedChatPairs: updatedPairs });

  return newPair;
}

/**
 * チャットペアを更新する
 * @param pairId 更新するペアのID
 * @param updates 更新内容
 */
export async function updateChatPair(pairId: string, updates: Partial<Omit<ChatPair, 'id' | 'createdAt'>>) {
  const config = await getUserConfig();
  const pairs = config.savedChatPairs || [];
  
  const updatedPairs = pairs.map(pair => 
    pair.id === pairId 
      ? { ...pair, ...updates, updatedAt: Date.now() }
      : pair
  );

  await updateUserConfig({ savedChatPairs: updatedPairs });
}

/**
 * チャットペアを削除する
 * @param pairId 削除するペアのID
 */
export async function deleteChatPair(pairId: string) {
  const config = await getUserConfig();
  const pairs = config.savedChatPairs || [];
  
  const updatedPairs = pairs.filter(pair => pair.id !== pairId);
  await updateUserConfig({ savedChatPairs: updatedPairs });
}

/**
 * 保存されたチャットペアを取得する
 * @returns 保存されたチャットペアの配列
 */
export async function getSavedChatPairs(): Promise<ChatPair[]> {
  const config = await getUserConfig();
  return config.savedChatPairs || [];
}

/**
 * ユーザー設定をすべて初期化する（デフォルト設定に戻す）
 * @returns Promise<void>
 */
export async function resetUserConfig(): Promise<void> {
  try {
    // 1. Browser.storage.local をすべてクリア
    await Browser.storage.local.clear();

    // 2. Browser.storage.sync をすべてクリア
    await Browser.storage.sync.clear();

    // 3. localStorage (Web Storage API) をすべてクリア
    localStorage.clear();

    // デフォルト設定を保存
    await updateUserConfig({ ...userConfigWithDefaultValue });
  } catch (error) {
    console.error('Failed to reset user config:', error);
    throw error;
  }
}

/**
 * フラグ系・表示設定のみをリセットする（起動回数、初回起動フラグ、言語、テーマ、フォントなど）
 * Chat・API関係の設定は保持されます
 * @returns Promise<void>
 */
export async function resetFlags(): Promise<void> {
  try {
    // Browser.storage.sync から削除するキー
    const syncKeysToRemove = [
      'openTimes',
      'premiumModalOpenTimes',
      'hasUsedOmniboxSearch',
      'lastCheckReleaseNotesVersion',
      'lastSystemPromptVersion',
      'showSessionRestore',
      'startupPage',
      'fontType',
    ];
    await Browser.storage.sync.remove(syncKeysToRemove);

    // Browser.storage.local から削除するキー
    const allLocalData = await Browser.storage.local.get(null);
    const localKeysToRemove = [
      ...Object.keys(allLocalData).filter(key => key.startsWith('companyProfile_')),
      'pendingOmniboxSearch',
    ];
    if (localKeysToRemove.length > 0) {
      await Browser.storage.local.remove(localKeysToRemove);
    }

    // localStorage から削除するキー
    const localStorageKeysToRemove = [
      'language',
      'themeMode',
      'sidebarCollapsed',
      'sidebarDisplayMode',
      'themeColor',
      'followArcTheme',
      'restoreOnStartup',
      'sidePanelBot',
    ];
    localStorageKeysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to reset flags:', error);
    throw error;
  }
}
