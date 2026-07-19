/**
 * i18n Migration Script
 *
 * 既存の言語別JSONファイル (english.json, japanese.json, etc.) を
 * モジュール別・多言語統合形式のJSONファイルに変換します。
 *
 * 実行: bun run scripts/migrate-i18n.ts
 */

import fs from 'fs'
import path from 'path'

const LANGS = ['en', 'ja', 'zh-CN', 'zh-TW'] as const
type Lang = (typeof LANGS)[number]
type MultiLangValue = Record<Lang, string>
type Module = Record<string, MultiLangValue>

// ─── Load existing lang files ───────────────────────────────────────────────
const localesDir = 'src/app/i18n/locales'
const en = JSON.parse(fs.readFileSync(`${localesDir}/english.json`, 'utf8')) as Record<string, string>
const ja = JSON.parse(fs.readFileSync(`${localesDir}/japanese.json`, 'utf8')) as Record<string, string>
const zhCN = JSON.parse(fs.readFileSync(`${localesDir}/simplified-chinese.json`, 'utf8')) as Record<string, string>
const zhTW = JSON.parse(fs.readFileSync(`${localesDir}/traditional-chinese.json`, 'utf8')) as Record<string, string>

const langData: Record<Lang, Record<string, string>> = { en, ja, 'zh-CN': zhCN, 'zh-TW': zhTW }

// ─── Collect all keys (en is master, include extras from other langs) ────────
const masterKeys = Object.keys(en)
const extraKeys = [...new Set([...Object.keys(ja), ...Object.keys(zhCN), ...Object.keys(zhTW)])]
  .filter(k => !en[k])
const allKeys = [...masterKeys, ...extraKeys]

// ─── Build multilang map ─────────────────────────────────────────────────────
const multiLang: Record<string, MultiLangValue> = {}
for (const key of allKeys) {
  multiLang[key] = {
    en: en[key] ?? '',
    ja: ja[key] ?? en[key] ?? '',
    'zh-CN': zhCN[key] ?? en[key] ?? '',
    'zh-TW': zhTW[key] ?? en[key] ?? '',
  }
}

// ─── Module assignment ───────────────────────────────────────────────────────
type ModuleName =
  | 'release-notes'
  | 'errors'
  | 'attachment'
  | 'image'
  | 'api'
  | 'modals'
  | 'settings'
  | 'chat'
  | 'common'

function getModule(key: string): ModuleName {
  // 1. Release notes
  if (
    key.startsWith('releasenote') ||
    key.startsWith('ReleaseNote-') ||
    key === 'Release Notes' ||
    key === 'Recent Updates'
  ) return 'release-notes'

  // 2. File/audio errors (attachment-related errors go to attachment)
  if (
    key.startsWith('file_error_') ||
    key.startsWith('audio_warning_') ||
    key === 'pdf_not_supported_provider'
  ) return 'attachment'

  // 3. General errors
  if (
    key.startsWith('Failed to ') ||
    key.startsWith('Error ') ||
    key.startsWith('Invalid ') ||
    key === 'Please check your network connection' ||
    key === 'Error cleaning up old storage keys' ||
    key === 'Failed to copy'
  ) return 'errors'

  // 4. Attachment
  if (
    key.startsWith('Attach') ||
    key.startsWith('Attachment') ||
    key.startsWith('Audio') ||
    key.startsWith('Transcri') ||
    key === 'Drop files to attach' ||
    key === 'Images and text files are supported' ||
    key === 'Edit file content...' ||
    key === 'GPT-4o with speaker identification (diarization).' ||
    key === 'Without transcription, the audio file will only be sent to audio-capable AIs (e.g., Gemini). Other AIs (Claude, GPT, etc.) will not receive the audio content.' ||
    key === 'Classic Whisper model. Good balance.' ||
    key === 'Newer models may offer better accuracy.' ||
    key === 'Select Gemini Bot' ||
    key === 'No Gemini bots configured.' ||
    key === 'The selected Gemini bot will be used to transcribe the audio.' ||
    key === 'Image input'
  ) return 'attachment'

  // 5. Image generation
  if (
    key === 'image_only_response' ||
    key === 'image_agent_history_note' ||
    key === 'Image Generation (Agent)' ||
    key === 'Image Provider' ||
    key === 'Image Size' ||
    key === 'Image Quality' ||
    key === 'Image Scheme' ||
    key === 'Image Scheme (override)' ||
    key === 'Select Image Provider' ||
    key === 'Select which image generation API to use' ||
    key === 'portrait-suffix' ||
    key === 'landscape-suffix' ||
    key === 'Aspect Ratio' ||
    key === 'Resolution' ||
    key === 'Default (auto)' ||
    key === 'Default aspect ratio for generated images' ||
    key === 'Output image resolution (Gemini 3 image models only)' ||
    key === 'Output Format' ||
    key === 'Background' ||
    key === 'transparent' ||
    key === 'Compression (0-100)' ||
    key === 'Only for jpeg/webp' ||
    key === 'Moderation' ||
    key === 'Compare with image input' ||
    key === 'Images in chat history will not be restored.' ||
    key === 'Recommended' ||
    key === 'Easy setup with API integration - supports a wide range of models' ||
    key === 'Tool Description' ||
    key.startsWith('Input Schema') ||
    key === 'Description of what this image generation tool does' ||
    key === 'Define the parameters for image generation. Must be valid JSON.' ||
    key === 'Fetch Schema' ||
    key === 'Fetch input schema for this model from Replicate API' ||
    key.startsWith('Common models:') ||
    key === 'Follow Provider' ||
    key === 'Override the provider dialect if needed'
  ) return 'image'

  // 6. API / Provider settings
  if (
    key === 'API Provider' ||
    key === 'API Providers' ||
    key === 'API Settings' ||
    key === 'API Scheme' ||
    key === 'API Endpoint (Full Path)' ||
    key === 'Add Provider' ||
    key === 'Edit Provider' ||
    key === 'Provider name' ||
    key === 'Provider updated successfully' ||
    key === 'Provider deleted. Bots referencing it have been switched to individual settings.' ||
    key === 'Provider reference' ||
    key === 'Provider reference missing (id: {{id}})' ||
    key === 'Select Provider Icon' ||
    key === 'Select Provider' ||
    key === 'Or choose from presets below:' ||
    key === 'Are you sure you want to delete this provider?' ||
    key === 'Manage your API provider configurations here. These can be referenced by individual chatbots.' ||
    key === 'Import API Providers' ||
    key === 'Custom API Models' ||
    key === 'Custom API Template' ||
    key === 'Import Custom API Template' ||
    key === 'Custom API settings imported successfully' ||
    key === 'Export Custom API Config as a Template (No API Keys)' ||
    key === 'No Custom API settings found in the file. Please check the file format.' ||
    key === 'Template Import Export' ||
    key === 'Import Template' ||
    key === 'Export Template' ||
    key === 'Apply Template Settings' ||
    key === 'Host works both with /v1 or without /v1' ||
    key === 'Full Path' ||
    key === 'Full Path Tooltip Common' ||
    key === 'Full Path Tooltip Individual' ||
    key.startsWith('Host Placeholder') ||
    key.startsWith('Host Blockquote') ||
    key === 'All hosts' ||
    key === 'Matching hosts' ||
    key === 'Not applicable for Google Gemini' ||
    key === 'Common API Key' ||
    key === 'Common API Host' ||
    key === 'Enter API Key for this provider' ||
    key === 'Vertex AI Mode' ||
    key === 'Enable for Vertex AI endpoints and Rakuten AI Gateway' ||
    key === 'Enable for Vertex AI endpoints and Rakuten AI Gateway (requires vertexai=True in SDK)' ||
    key.startsWith('vertex_') ||
    key === 'Developer Options (Dangerous)' ||
    key === 'Allow Only Specific Providers (OpenRouter)' ||
    key === 'Comma-separated list of providers to allow. See OpenRouter docs.' ||
    key === 'Anthropic Beta Headers' ||
    key.startsWith('Comma-separated beta') ||
    key === 'Custom Chatbot Name' ||
    key === 'Custom Chatbot No.' ||
    key === 'user-defined-model' ||
    key === 'Or enter model name manually' ||
    key === 'Add New Model' ||
    key === 'Available Models' ||
    key === 'Fetch Models' ||
    key === 'Search models...' ||
    key === 'Click "Fetch Models" to load available models' ||
    key === 'Please configure API Key and Host to fetch models' ||
    key === 'Thinking Mode' ||
    key === 'Thinking Budget' ||
    key === 'Thinking Level' ||
    key === 'thinking_mode_support_note' ||
    key === 'Extended Thinking is not yet supported with Vertex AI Claude API (vertex-2023-10-16)' ||
    key === 'Temperature' ||
    key === 'Confirmed.' ||
    key === 'Verify' ||
    key === 'Duplicate' ||
    key === 'Advanced Settings' ||
    key === 'AI Model' ||
    key === 'Avatar' ||
    key === 'Choose model' ||
    key === 'Move up' ||
    key === 'Move down' ||
    key === 'hidden' ||
    key === 'Individual Settings' ||
    key === 'Use Individual Settings' ||
    key === 'When off, this chatbot uses the selected API Provider reference' ||
    key === 'None (not set)' ||
    key === 'Not configured' ||
    key === 'Not set' ||
    key === 'Public Models' ||
    key === 'Select API Config' ||
    key === 'Select Model' ||
    key === 'Not supported' ||
    key === 'Loading...' ||
    key === 'https://example.com/icon.png or leave blank to select from presets' ||
    key === 'Custom Icon URL' ||
    key === 'Perplexity Icons' ||
    key === 'OpenSource' ||
    key === 'GitHub'
  ) return 'api'

  // 7. Modals / dialogs (storage migration, reset, company profile, system prompt)
  if (
    // Storage migration
    key === 'Storage Optimization Available' ||
    key === 'We can optimize your chat history storage to improve loading speed by up to 16×. This one-time process will migrate your existing sessions to a more efficient format.' ||
    key === 'This may take a few minutes depending on the number of sessions you have.' ||
    key === 'Later' ||
    key === 'Optimize Now' ||
    key === 'Optimizing Storage...' ||
    key === 'Verifying migration...' ||
    key === 'Migrating {{current}} of {{total}} sessions' ||
    key === 'Please wait, this will only happen once...' ||
    key === 'Migration Error' ||
    key === 'An unknown error occurred' ||
    key === 'Retry' ||
    // Storage cleanup
    key === 'Storage cleanup available' ||
    key.startsWith('Found {{count}} old') ||
    key === 'Show details' ||
    key === 'Hide details' ||
    key === 'Remove Old Data' ||
    key === 'Cleanup Mode:' ||
    key === 'Safe (Recommended)' ||
    key === 'Aggressive (Advanced)' ||
    key === 'Removes only known safe legacy keys' ||
    key === 'Removes all keys except protected ones' ||
    key === 'Keys to be removed:' ||
    key.startsWith('Safe Mode (Default)') ||
    key.startsWith('Aggressive Mode') ||
    key.startsWith('Sync Storage:') ||
    key.startsWith('Local Storage:') ||
    key.startsWith('Sync storage:') ||
    key.startsWith('Local storage:') ||
    key === 'No keys to remove' ||
    key === 'Confirm Safe Cleanup' ||
    key === 'Confirm Aggressive Cleanup' ||
    key.startsWith('This will remove') ||
    key.startsWith('Keys to be removed: ') ||
    key === 'Safe Cleanup' ||
    key === 'Aggressive Cleanup' ||
    key === 'Cleaning...' ||
    key.startsWith('Successfully removed') ||
    // Danger Zone / Reset
    key === 'Danger Zone' ||
    key === 'Reset All Settings' ||
    key === 'This action will permanently delete all your custom settings, API configurations, and preferences.' ||
    key === 'Before you proceed:' ||
    key === 'Consider exporting your current settings as a backup' ||
    key === 'You can import the exported settings later if needed' ||
    key === 'Confirm Reset' ||
    key === 'Are you sure you want to reset all settings? This action cannot be undone.' ||
    key === 'Recommendation:' ||
    key === 'Please export your current settings before resetting to avoid losing your configuration. You can find the export option at the top of the settings page.' ||
    key === 'All settings have been reset to default' ||
    key === 'Failed to reset settings. Please try again.' ||
    key === 'Reset Flags and Display Settings' ||
    key === 'Reset startup flags, display preferences, language, and theme. API and chat settings will be preserved.' ||
    key === 'Includes: launch count, language, theme, font, startup page, company profile status, etc.' ||
    key === 'Reset Flags' ||
    key === 'Confirm Reset Flags' ||
    key === 'This will reset startup counters, display preferences, language, and theme settings. Your API keys and chat configurations will not be affected.' ||
    key === 'What will be reset:' ||
    key === 'Launch count and first-time flags' ||
    key === 'Language and theme preferences' ||
    key === 'Font type and startup page' ||
    key === 'Company profile status' ||
    key === 'Flags and display settings have been reset' ||
    key === 'Failed to reset flags. Please try again.' ||
    // Company profile
    key === 'company_profile_detected' ||
    key === 'apply_company_profile' ||
    key === 'apply_company_profile_description' ||
    key === 'company_profile_version_update' ||
    key === 'company_profile_version_info' ||
    key === 'company_template_import' ||
    key === 'Reset Company Profile Settings' ||
    key === 'Ask me again' ||
    key === 'Reject' ||
    // System prompt update modal
    key === 'System Prompt Updated' ||
    key === 'Default system prompt has been updated to version' ||
    key === 'Would you like to update your Common System Message? Select your preferred language:' ||
    key === 'System prompt has been updated' ||
    key === 'Failed to update system prompt' ||
    key === 'Skip' ||
    key === 'Current' ||
    key === 'Latest' ||
    key === 'Warning: Your system prompt has been customized' ||
    key === 'Updating will overwrite your changes. Your current prompt is backed up below.' ||
    key === 'Current Prompt Backup' ||
    key === 'View previous backup prompt' ||
    key === 'Previous System Prompt Backup' ||
    key === 'This is your system prompt before the last update. You can copy and restore it manually if needed.' ||
    key === 'No backup found. Backups are created when you update your system prompt.'
  ) return 'modals'

  // 8. Settings page
  if (
    key === 'Settings' ||
    key === 'Settings saved' ||
    key === 'Settings saved. Please reload the extension to reflect changes in the Sidebar.' ||
    key === 'Settings saved. API changes require reload' ||
    key === 'Save changes' ||
    key.startsWith('Display') ||
    key === 'Auto (Dynamic based on screen size)' ||
    key === 'Fixed Sidebar' ||
    key === 'Drawer Menu' ||
    key.startsWith('Sidebar') ||
    key === 'Theme Mode' ||
    key === 'Theme Color' ||
    key === 'Auto' ||
    key === 'Light' ||
    key === 'Dark' ||
    key === 'Follow Arc browser theme' ||
    key === 'Customize theme' ||
    key === 'Language' ||
    key === 'Font Type' ||
    key === 'Sans-serif (Gothic)' ||
    key === 'Serif (Mincho)' ||
    key === 'Startup page' ||
    key.startsWith('Noto ') ||
    key === 'Optimal font display experience for CJK (Chinese, Japanese, Korean)' ||
    key === 'This application uses Noto CJK fonts. Please download and install them for the best experience:' ||
    key.startsWith('Downloading Noto') ||
    key === 'Direct download links' ||
    key === 'Chatbots configuration' ||
    key === 'Import ChatBot Settings' ||
    key === 'Override Chatbot' ||
    key === 'Show session restore on startup' ||
    key === 'Quick access in Chrome side bar' ||
    key === 'All-In-One' ||
    key.startsWith('All-in-One:') ||
    key === 'More layouts in All-In-One mode' ||
    key === 'Chat with more than 2 bots simultaneously' ||
    key === 'Full-text search for chat history' ||
    key === 'Quick Settings' ||
    key === 'Temporary' ||
    key === 'Quick settings are temporary and reset on reload' ||
    key === 'Shortcut to open this app' ||
    key === 'Change shortcut' ||
    key === 'Shortcuts' ||
    key === 'Import Export Panel' ||
    key.startsWith('All Import Export') ||
    key.startsWith('Data includes') ||
    key === 'Export/Import All Data' ||
    key === 'Export/Import Data' ||
    key === 'Select Items' ||
    key === 'Chatbot Settings' ||
    key === 'Chat History' ||
    key === 'Local Prompts' ||
    key === 'User Preferences' ||
    key === 'View Settings' ||
    key === 'Current Settings' ||
    key === 'Current settings with API keys masked for security' ||
    key === 'Copy to Clipboard' ||
    key === 'Copied to clipboard' ||
    key === 'Show Variables' ||
    key === 'Variables description' ||
    key === 'Show available variables' ||
    key === 'Your keys are stored locally' ||
    key === 'Your browser does not support the video tag.' ||
    key === 'Enable' ||
    key === 'Disable' ||
    key === 'Disabled' ||
    key === 'Enabled'
  ) return 'settings'

  // 9. Chat interface
  if (
    key === 'Send' ||
    key === 'Stop' ||
    key === 'Clear conversation' ||
    key === 'Clear history messages' ||
    key === 'Are you sure you want to clear history messages?' ||
    key.startsWith('AI Response') ||
    key === 'com_ui_thoughts' ||
    key === 'messages' ||
    key === 'History sessions stats' ||
    key === 'Restore Session' ||
    key === 'Failed to restore session.' ||
    key === 'Load 100 more' ||
    key === 'Load 500 more' ||
    key === 'Loading sessions...' ||
    key === 'Use ↑↓ keys to navigate, Enter to select, Esc to start new session' ||
    key === 'Use ↑↓ keys to navigate, Enter to select, Esc to close' ||
    key === 'Click outside or press Esc to close' ||
    key === 'Click outside or press Esc to start new session' ||
    key === 'Start New Session' ||
    key === 'Begin a fresh conversation' ||
    key === 'No previous sessions found' ||
    key === 'No sessions found.' ||
    key === 'Individual bot' ||
    key === 'Web Search Results' ||
    key === 'Web Access' ||
    key === 'Reference Sites' ||
    key === 'Improving accuracy by searching up-to-date information from the internet' ||
    key.startsWith('layout_') ||
    key.startsWith('agent_') ||
    key === 'addressbar_search_feature_description' ||
    key === 'Address Bar Search Feature' ||
    key.startsWith('Propaganda') ||
    key === 'Share conversation' ||
    key === 'View history' ||
    key === 'Deactivate' ||
    key.startsWith('Use / to select') ||
    key === 'Enter to add a new line, Shift+Enter to send.' ||
    key === 'Compose Message' ||
    key === 'Use {{provider}} web search (OFF: HuddleLLM Web Access)' ||
    key === '{{provider}} Web Search' ||
    key === 'create_new_all_in_one' ||
    key === 'Got it!' ||
    key === "Don't show again" ||
    key === 'System Message' ||
    key === 'System Prompt' ||
    key === 'Show session restore on startup'
  ) return 'chat'

  // Default: common
  return 'common'
}

// ─── Group keys by module ────────────────────────────────────────────────────
const modules: Record<ModuleName, Module> = {
  'release-notes': {},
  errors: {},
  attachment: {},
  image: {},
  api: {},
  modals: {},
  settings: {},
  chat: {},
  common: {},
}

for (const key of allKeys) {
  const moduleName = getModule(key)
  modules[moduleName][key] = multiLang[key]
}

// ─── Write output files ──────────────────────────────────────────────────────
for (const [moduleName, moduleData] of Object.entries(modules)) {
  const outputPath = path.join(localesDir, `${moduleName}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(moduleData, null, 2) + '\n')
  console.log(`✓ ${outputPath} (${Object.keys(moduleData).length} keys)`)
}

// ─── Stats ───────────────────────────────────────────────────────────────────
const totalNew = Object.values(modules).reduce((sum, m) => sum + Object.keys(m).length, 0)
console.log(`\nTotal: ${allKeys.length} keys → ${totalNew} keys across ${Object.keys(modules).length} modules`)
if (totalNew !== allKeys.length) {
  console.warn(`⚠ Key count mismatch! allKeys=${allKeys.length}, totalNew=${totalNew}`)
}
