import i18next from 'i18next'
import { fileOpen } from 'browser-fs-access'
import Browser from 'webextension-polyfill'
import { requestHostPermissions } from '~services/host-permissions'
import { CustomApiConfig, ProviderConfig, CustomApiProvider } from '~services/user-config'
import {
  SESSION_INDEX_KEY,
  SESSION_ENTITY_KEY,
  AIO_ENTITY_KEY,
  MIGRATION_STATUS_KEY,
  SessionIndexV2,
} from '~services/chat-history'
import { getCompanyProfileConfigs } from '~services/company-profile'

/**
 * Helper function to download a blob as a file
 * Uses traditional <a> tag method to avoid SecurityError with showSaveFilePicker
 */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Full-screen progress overlay for long-running export.
 * Uses DOM directly (no React) so it can be controlled from a plain async function.
 */
function createExportProgressOverlay() {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(0,0,0,0.55)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:system-ui,-apple-system,sans-serif',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'min-width:320px', 'max-width:80vw',
    'background:#fff', 'color:#111',
    'border-radius:12px', 'padding:20px 24px',
    'box-shadow:0 10px 40px rgba(0,0,0,0.3)',
  ].join(';')

  const title = document.createElement('div')
  title.textContent = i18next.t('Exporting...')
  title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:8px'

  const status = document.createElement('div')
  status.style.cssText = 'font-size:13px;color:#444;margin-bottom:12px;word-break:break-all'

  const barWrap = document.createElement('div')
  barWrap.style.cssText = 'width:100%;height:6px;background:#eee;border-radius:3px;overflow:hidden'
  const bar = document.createElement('div')
  bar.style.cssText = 'height:100%;width:0%;background:#3b82f6;transition:width 120ms linear'
  barWrap.appendChild(bar)

  card.appendChild(title)
  card.appendChild(status)
  card.appendChild(barWrap)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  return {
    update(text: string, ratio: number) {
      status.textContent = text
      bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`
    },
    setTitle(text: string) {
      title.textContent = text
    },
    destroy() {
      overlay.remove()
    },
  }
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Enumerate all storage.local keys the app is known to write to.
 * Critically, we DO NOT call Browser.storage.local.get(null) — that would
 * deserialize the entire (potentially multi-GB) storage into the JS heap
 * at once and blow past V8 limits. We instead derive keys from the V2
 * session index plus a static whitelist of config keys.
 */
async function collectExportLocalKeys(): Promise<string[]> {
  const keys: string[] = []

  // V2 session index (always small) — fetch first, then enumerate entities
  const indexResult = await Browser.storage.local.get(SESSION_INDEX_KEY)
  const index = indexResult[SESSION_INDEX_KEY] as SessionIndexV2 | undefined
  if (index?.sessions) {
    for (const s of index.sessions) {
      if (s.type === 'aio') {
        keys.push(AIO_ENTITY_KEY(s.id))
      } else if (s.type === 'snap') {
        keys.push(SESSION_ENTITY_KEY(s.id))
      }
    }
  }
  keys.push(SESSION_INDEX_KEY)
  keys.push(MIGRATION_STATUS_KEY)

  // Known scalar config keys (small, fixed)
  keys.push(
    'systemPromptBackup',
    'activeAllInOnePair',
    'allInOnePairs',
    'prompts',
    'customApiConfigs',
  )

  // Dynamic companyProfile_* keys — enumerated from configured presets
  try {
    const presets = await getCompanyProfileConfigs()
    for (const p of presets) {
      keys.push(`companyProfile_${p.companyName}`)
    }
  } catch {
    // Ignore — presets are optional
  }

  // V1 legacy (only if it still happens to exist post-migration)
  keys.push('sessionSnapshots')

  return Array.from(new Set(keys))
}

/**
 * Chunked Blob accumulator. Each time the in-memory string buffer reaches
 * FLUSH_BYTES, we flip the accumulated parts into a Blob (which Chrome can
 * disk-back) and drop the string references so they can be GC'd. This keeps
 * the JS heap bounded regardless of total export size.
 */
class ChunkedBlobBuilder {
  private chunks: Blob[] = []
  private buffer: BlobPart[] = []
  private bufferBytes = 0
  private readonly FLUSH_BYTES = 32 * 1024 * 1024

  push(part: string) {
    this.buffer.push(part)
    this.bufferBytes += part.length
    if (this.bufferBytes >= this.FLUSH_BYTES) {
      this.flush()
    }
  }

  private flush() {
    if (this.buffer.length === 0) return
    this.chunks.push(new Blob(this.buffer))
    this.buffer = []
    this.bufferBytes = 0
  }

  build(type: string): Blob {
    this.flush()
    const result = new Blob(this.chunks, { type })
    this.chunks = []
    return result
  }
}

export async function exportData() {
  // sync storage is bounded (~100KB total) — safe to load wholesale
  const syncData = await Browser.storage.sync.get(null)

  // Best-effort pre-flight size check (API may be unavailable on some browsers)
  const localArea = Browser.storage.local as { getBytesInUse?: () => Promise<number> }
  const bytesInUse = localArea.getBytesInUse ? await localArea.getBytesInUse.call(Browser.storage.local) : 0
  const MB = bytesInUse / (1024 * 1024)

  if (MB > 500) {
    const proceed = confirm(i18next.t('Export size warning', { size: MB.toFixed(1) }))
    if (!proceed) return
  }

  const overlay = createExportProgressOverlay()
  try {
    overlay.update(i18next.t('Indexing...'), 0)
    await yieldToUI()

    const localKeys = await collectExportLocalKeys()
    const totalKeys = localKeys.length

    const builder = new ChunkedBlobBuilder()
    builder.push('{"sync":')
    builder.push(JSON.stringify(syncData))
    builder.push(',"local":{')

    let wroteAny = false
    for (let i = 0; i < totalKeys; i++) {
      const key = localKeys[i]
      // Serial fetch: load exactly one key into the heap, then drop the reference
      const result = await Browser.storage.local.get(key)
      const value = result[key]
      // Explicitly null out the wrapper so the inner value isn't anchored
      // by the surrounding object once we're done with it.
      ;(result as Record<string, unknown>)[key] = undefined

      if (value === undefined) {
        // Key didn't exist (e.g. optional legacy key). Skip cleanly.
        overlay.update(i18next.t('export_progress_key_skipped', { current: i + 1, total: totalKeys, key }), (i + 1) / totalKeys)
        await yieldToUI()
        continue
      }

      if (wroteAny) builder.push(',')
      builder.push(JSON.stringify(key))
      builder.push(':')
      builder.push(JSON.stringify(value))
      wroteAny = true

      overlay.update(i18next.t('export_progress_key', { current: i + 1, total: totalKeys, key }), (i + 1) / totalKeys)
      // Yield every iteration so the overlay updates and GC has a chance to run
      await yieldToUI()
    }

    builder.push('},"localStorage":')
    const lsObj: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) {
        const v = localStorage.getItem(k)
        if (v !== null) lsObj[k] = v
      }
    }
    builder.push(JSON.stringify(lsObj))
    builder.push('}')

    overlay.update(i18next.t('Building file...'), 1)
    await yieldToUI()

    const blob = builder.build('application/json')
    downloadBlob(blob, 'huddlellm.json')
  } finally {
    overlay.destroy()
  }
}

export async function importData() {
  const overlay = createExportProgressOverlay()
  overlay.setTitle(i18next.t('Importing...'))

  let json: { sync?: Record<string, unknown>; local?: Record<string, unknown>; localStorage?: Record<string, string> } | null = null
  let fileSize = 0
  try {
    const blob = await fileOpen({ extensions: ['.json'] })
    fileSize = blob.size
    overlay.update(i18next.t('Reading file...', { size: (fileSize / 1024 / 1024).toFixed(1) }), 0.02)
    await yieldToUI()

    const fileText = await blob.text()
    overlay.update(i18next.t('Parsing JSON...'), 0.08)
    await yieldToUI()
    json = JSON.parse(fileText)
  } catch (e) {
    overlay.destroy()
    const errorMsg = e instanceof Error ? e.message : String(e)
    alert(i18next.t('Failed to read import file', { error: errorMsg, size: (fileSize / 1024 / 1024).toFixed(1) }))
    return
  }

  if (!json?.sync) {
    overlay.destroy()
    throw new Error('Invalid data')
  }
  // Initialize empty local data if not present
  if (!json.local) {
    json.local = {}
  }

  // Handle modern customApiConfigs that should be in local storage
  if (json.local.customApiConfigs && Array.isArray(json.local.customApiConfigs)) {
    // Modern format: customApiConfigs are already in local storage, no conversion needed
  } else if (json.sync.customApiConfigs && Array.isArray(json.sync.customApiConfigs)) {
    // Transition format: move customApiConfigs from sync to local
    json.local.customApiConfigs = json.sync.customApiConfigs
    delete json.sync.customApiConfigs
  }

  if (!window.confirm(i18next.t('Confirm import overwrite'))) {
    overlay.destroy()
    return
  }

  const failedKeys: { area: string; key: string; error: string }[] = []

  try {
    overlay.update(i18next.t('Clearing local storage...'), 0)
    await yieldToUI()
    await Browser.storage.local.clear()

    // Serial set of storage.local — 1 key at a time so a single huge value
    // cannot stall or OOM the rest of the import.
    const localEntries = Object.entries(json.local as Record<string, unknown>)
    const totalLocal = localEntries.length
    for (let i = 0; i < totalLocal; i++) {
      const [key, value] = localEntries[i]
      overlay.update(i18next.t('import_progress_local', { current: i + 1, total: totalLocal, key }), totalLocal === 0 ? 0 : (i + 1) / totalLocal / 2)
      try {
        await Browser.storage.local.set({ [key]: value })
      } catch (e) {
        failedKeys.push({ area: 'local', key, error: e instanceof Error ? e.message : String(e) })
      }
      await yieldToUI()
    }

    overlay.update(i18next.t('Clearing sync storage...'), 0.5)
    await yieldToUI()
    await Browser.storage.sync.clear()

    // Serial set of storage.sync as well — defensive even though sync is small
    const syncEntries = Object.entries(json.sync as Record<string, unknown>)
    const totalSync = syncEntries.length
    for (let i = 0; i < totalSync; i++) {
      const [key, value] = syncEntries[i]
      overlay.update(i18next.t('import_progress_sync', { current: i + 1, total: totalSync, key }), totalSync === 0 ? 0.5 : 0.5 + ((i + 1) / totalSync) * 0.4)
      try {
        await Browser.storage.sync.set({ [key]: value })
      } catch (e) {
        failedKeys.push({ area: 'sync', key, error: e instanceof Error ? e.message : String(e) })
      }
      await yieldToUI()
    }

    if (json.localStorage) {
      overlay.update(i18next.t('Restoring localStorage...'), 0.92)
      await yieldToUI()
      const lsKeys = Object.keys(json.localStorage as Record<string, string>)
      for (const k of lsKeys) {
        const v = (json.localStorage as Record<string, string>)[k]
        try {
          localStorage.setItem(k, v)
        } catch (e) {
          failedKeys.push({ area: 'localStorage', key: k, error: e instanceof Error ? e.message : String(e) })
        }
      }
    }

    // Request host permissions for imported API hosts
    overlay.update(i18next.t('Requesting host permissions...'), 0.97)
    await yieldToUI()
    try {
      const importedConfig = json.local
      if (importedConfig?.customApiConfigs) {
        const providerConfigs = (importedConfig as Record<string, unknown>).providerConfigs
        const customApiConfigs = importedConfig.customApiConfigs as CustomApiConfig[]
        await requestHostPermissions(customApiConfigs, Array.isArray(providerConfigs) ? (providerConfigs as unknown as ProviderConfig[]) : [])
      }
    } catch (permissionError) {
      failedKeys.push({
        area: 'permissions',
        key: '(host permissions)',
        error: permissionError instanceof Error ? permissionError.message : String(permissionError),
      })
    }

    overlay.update(i18next.t('Done.'), 1)
    await yieldToUI()
  } finally {
    overlay.destroy()
  }

  const failureSummary = failedKeys.length
    ? i18next.t('import_failure_summary', {
        count: failedKeys.length,
        list: failedKeys.slice(0, 20).map((f) => `- ${f.key}: ${f.error}`).join('\n'),
      }) +
      (failedKeys.length > 20 ? i18next.t('import_failure_more', { count: failedKeys.length - 20 }) : '')
    : ''

  // Build a human-readable summary of what was restored
  const sessionIndex = (json.local as Record<string, unknown>)[SESSION_INDEX_KEY] as SessionIndexV2 | undefined
  const sessionCount = sessionIndex?.sessions?.length ?? 0
  const chatbots = (json.local as Record<string, unknown>).customApiConfigs
  const chatbotCount = Array.isArray(chatbots) ? chatbots.length : 0
  const chatbotNames = Array.isArray(chatbots)
    ? (chatbots as Array<{ name?: string }>).slice(0, 4).map(b => b.name).filter(Boolean)
    : []
  const pairs = (json.local as Record<string, unknown>).allInOnePairs as Record<string, { pairName?: string }> | undefined
  const pairEntries = pairs && typeof pairs === 'object' ? Object.entries(pairs) : []
  const pairCount = pairEntries.length
  const pairNames = pairEntries
    .slice(0, 3)
    .map(([key, config]) => config?.pairName || key)
    .filter(Boolean)
  const ls = json.localStorage as Record<string, string> | undefined
  const theme = ls?.themeMode?.replace(/"/g, '') || ''
  const lang = ls?.language?.replace(/"/g, '') || ''
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : theme === 'auto' ? 'Auto' : theme || 'Default'
  const langLabel = lang === 'ja' ? '日本語' : lang === 'zh-CN' ? '中文(简体)' : lang === 'zh-TW' ? '中文(繁體)' : lang || 'English'

  const importSummaryLines: string[] = []
  if (sessionCount > 0) importSummaryLines.push(i18next.t('import_summary_sessions', { count: sessionCount }))
  if (chatbotCount > 0) {
    const names = chatbotNames.length > 0
      ? ` (${chatbotNames.join(', ')}${chatbotCount > chatbotNames.length ? '...' : ''})`
      : ''
    importSummaryLines.push(i18next.t('import_summary_chatbots', { count: chatbotCount, names }))
  }
  if (pairCount > 0) {
    const names = pairNames.length > 0
      ? ` (${pairNames.join(', ')}${pairCount > pairNames.length ? '...' : ''})`
      : ''
    importSummaryLines.push(i18next.t('import_summary_pairs', { count: pairCount, names }))
  }
  if (theme) importSummaryLines.push(i18next.t('import_summary_theme', { theme: themeLabel }))
  if (lang) importSummaryLines.push(i18next.t('import_summary_language', { language: langLabel }))

  const importSummary = importSummaryLines.length > 0
    ? '\n\n' + importSummaryLines.map(l => `- ${l}`).join('\n')
    : ''

  // Show result with copyable message
  const successMsg = i18next.t('Import completed successfully.')
  const fullMsg = successMsg + importSummary + failureSummary

  // Create a copyable result dialog
  const resultOverlay = document.createElement('div')
  resultOverlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(0,0,0,0.55)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:system-ui,-apple-system,sans-serif',
  ].join(';')

  const resultCard = document.createElement('div')
  resultCard.style.cssText = [
    'min-width:400px', 'max-width:80vw', 'max-height:80vh',
    'background:#fff', 'color:#111',
    'border-radius:12px', 'padding:20px 24px',
    'box-shadow:0 10px 40px rgba(0,0,0,0.3)',
    'overflow:auto',
  ].join(';')

  const resultTitle = document.createElement('div')
  resultTitle.textContent = failedKeys.length > 0 ? i18next.t('Import completed with warnings') : i18next.t('Import completed')
  resultTitle.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:12px;color:' + (failedKeys.length > 0 ? '#d97706' : '#16a34a')

  const resultContent = document.createElement('div')
  resultContent.style.cssText = 'font-size:13px;white-space:pre-wrap;word-break:break-all;margin-bottom:16px;max-height:200px;overflow-y:auto'

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end'

  const copyBtn = document.createElement('button')
  copyBtn.textContent = i18next.t('Copy to clipboard')
  copyBtn.style.cssText = 'padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;font-size:13px'
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(fullMsg)
    copyBtn.textContent = i18next.t('Copied!')
    setTimeout(() => copyBtn.textContent = i18next.t('Copy to clipboard'), 2000)
  }

  const reloadBtn = document.createElement('button')
  reloadBtn.textContent = i18next.t('Reload now')
  reloadBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer;font-size:13px;font-weight:500'
  reloadBtn.onclick = () => location.reload()

  resultContent.textContent = fullMsg
  resultCard.appendChild(resultTitle)
  resultCard.appendChild(resultContent)
  btnRow.appendChild(copyBtn)
  btnRow.appendChild(reloadBtn)
  resultCard.appendChild(btnRow)
  resultOverlay.appendChild(resultCard)
  document.body.appendChild(resultOverlay)
}

/**
 * カスタムAPIテンプレートをエクスポートする関数
 * APIキーを除外し、テンプレートとして必要な情報のみを出力する
 */
export async function exportCustomAPITemplate() {
  // localストレージからcustomApiConfigsを取得
  const localData = await Browser.storage.local.get('customApiConfigs');
  const customApiConfigsArray = localData.customApiConfigs as CustomApiConfig[] | undefined;

  // syncストレージからproviderConfigs と commonSystemMessage を取得
  const syncData = await Browser.storage.sync.get(['providerConfigs', 'commonSystemMessage']);
  
  const templateExportData: { customApiConfigs?: Partial<CustomApiConfig>[], providerConfigs?: Partial<ProviderConfig>[], commonSystemMessage?: string } = {};
 
  if (customApiConfigsArray && Array.isArray(customApiConfigsArray)) {
    templateExportData.customApiConfigs = customApiConfigsArray.map(config => {
      // APIキーを除外したコピーを作成
      const { apiKey, ...restConfig } = config;
      return { ...restConfig, apiKey: '' }; // apiKeyを空にする
    });
  }
  
  // providerConfigsを含める（API Keyは除外）
  if (syncData.providerConfigs) {
    const providerConfigsArray = syncData.providerConfigs as ProviderConfig[];
    templateExportData.providerConfigs = providerConfigsArray.map((p) => {
      const isAnthropic = p.provider === CustomApiProvider.Anthropic || p.provider === CustomApiProvider.Anthropic_CustomAuth
      return {
        id: p.id,
        name: p.name,
        provider: p.provider,
        host: p.host,
        isHostFullPath: p.isHostFullPath,
        apiKey: '', // redact api key for template export
        icon: p.icon,
        ...(isAnthropic ? { isAnthropicUsingAuthorizationHeader: p.isAnthropicUsingAuthorizationHeader } : {}),
        ...(p.AuthMode ? { AuthMode: p.AuthMode } : {}),
        ...(p.VertexMode !== undefined ? { VertexMode: p.VertexMode } : {}),
        ...(p.outputType ? { outputType: p.outputType } : {}),
        advancedConfig: p.advancedConfig,
      } as Partial<ProviderConfig>
    });
  }
  
  // Common System Message を含める
  if (syncData.commonSystemMessage) {
    templateExportData.commonSystemMessage = syncData.commonSystemMessage;
  }
  
  // JSONとして保存
  // エクスポートするデータ構造は、customApiConfigsが配列であること、
  // およびcustomApiHostがトップレベルにあることを反映する
  const blob = new Blob([JSON.stringify(templateExportData)], { type: 'application/json' });
  downloadBlob(blob, 'huddlellm-template.json');
}
