import { compareVersions } from 'compare-versions'
import Browser from 'webextension-polyfill'
import { SYSTEM_PROMPT_VERSION, SYSTEM_PROMPTS } from '~app/system-prompts'
import { updateUserConfig } from './user-config'

/**
 * システムプロンプトのバージョンをチェックし、更新が必要かを返す
 */
export async function checkSystemPromptUpdate(): Promise<boolean> {
  const { lastSystemPromptVersion } = await Browser.storage.sync.get('lastSystemPromptVersion')

  // lastSystemPromptVersion がない場合は表示（初回ユーザー + 既存ユーザー）
  if (!lastSystemPromptVersion) {
    return true
  }

  // バージョン比較
  try {
    return compareVersions(SYSTEM_PROMPT_VERSION, lastSystemPromptVersion) > 0
  } catch (error) {
    console.error('Failed to compare system prompt versions:', error)
    return false
  }
}

/**
 * 現在のバージョンを既読としてマーク
 */
export async function markSystemPromptVersionAsRead(): Promise<void> {
  await Browser.storage.sync.set({ lastSystemPromptVersion: SYSTEM_PROMPT_VERSION })
}

/**
 * システムプロンプトを特定の言語で更新
 */
export async function updateSystemPromptToVersion(lang: 'en' | 'ja' | 'zh-CN' | 'zh-TW'): Promise<void> {
  // 現在のプロンプトをバックアップとして保存 (local storage)
  const { getUserConfig } = await import('./user-config')
  const config = await getUserConfig()
  await Browser.storage.local.set({ systemPromptBackup: config.commonSystemMessage })

  await updateUserConfig({ commonSystemMessage: SYSTEM_PROMPTS[lang] })
  await markSystemPromptVersionAsRead()
}

/**
 * バックアップされたシステムプロンプトを取得
 */
export async function getSystemPromptBackup(): Promise<string | undefined> {
  const { systemPromptBackup } = await Browser.storage.local.get('systemPromptBackup')
  return systemPromptBackup
}
