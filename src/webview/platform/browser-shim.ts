/**
 * Drop-in replacement for `webextension-polyfill`, aliased via tsconfig paths.
 * chrome.storage.local/sync are bridged to the extension host (JSON files /
 * globalState); the other namespaces implement just enough surface for the
 * ported code to run inside a VS Code webview.
 */
import type { KvChange, KvNamespace } from '../../shared/protocol'
import { rpc } from './rpc-client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageItems = Record<string, any>
type GetKeys = string | string[] | StorageItems | null | undefined

export interface StorageChange {
  oldValue?: unknown
  newValue?: unknown
}
export type StorageChanges = Record<string, StorageChange>
type OnChangedListener = (changes: StorageChanges, areaName: string) => void

function normalizeGet(keys: GetKeys): { wanted: string[] | null; defaults: StorageItems } {
  if (keys === null || keys === undefined) return { wanted: null, defaults: {} }
  if (typeof keys === 'string') return { wanted: [keys], defaults: {} }
  if (Array.isArray(keys)) return { wanted: keys, defaults: {} }
  return { wanted: Object.keys(keys), defaults: keys }
}

class StorageArea {
  constructor(private readonly ns: KvNamespace) {}

  async get(keys?: GetKeys): Promise<StorageItems> {
    const { wanted, defaults } = normalizeGet(keys)
    const data = (await rpc.kvRequest({ type: 'kv.get', ns: this.ns, keys: wanted })) ?? {}
    const out: StorageItems = { ...defaults }
    for (const [k, v] of Object.entries(data)) {
      out[k] = v
    }
    return out
  }

  async set(items: StorageItems): Promise<void> {
    await rpc.kvRequest({ type: 'kv.set', ns: this.ns, items })
  }

  async remove(keys: string | string[]): Promise<void> {
    await rpc.kvRequest({ type: 'kv.remove', ns: this.ns, keys: Array.isArray(keys) ? keys : [keys] })
  }

  async clear(): Promise<void> {
    await rpc.kvRequest({ type: 'kv.clear', ns: this.ns })
  }
}

// Chrome の tabs.setZoom 相当を CSS zoom で再現。localStorage ミラー経由で永続化。
const ZOOM_KEY = 'huddlellm.zoomLevel'

function currentZoom(): number {
  const v = parseFloat(window.localStorage.getItem(ZOOM_KEY) ?? '1')
  return Number.isFinite(v) && v > 0 ? v : 1
}

function applyZoomStyle(factor: number): void {
  ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(factor)
}

/** Called once at webview startup, after the localStorage mirror is seeded. */
export function applyStoredZoom(): void {
  const zoom = currentZoom()
  if (zoom !== 1) {
    applyZoomStyle(zoom)
  }
}

const onChangedListeners = new Set<OnChangedListener>()

// changes made from another webview (panel vs side view) arrive via the host
rpc.storageChangeListeners.add((ns: KvNamespace, changes: KvChange[]) => {
  if (ns === 'ls') return
  const mapped: StorageChanges = {}
  for (const c of changes) {
    mapped[c.key] = { oldValue: c.oldValue, newValue: c.newValue }
  }
  for (const listener of onChangedListeners) {
    listener(mapped, ns)
  }
})

const Browser = {
  storage: {
    local: new StorageArea('local'),
    sync: new StorageArea('sync'),
    // host memory: shared across the panel / side view / BTW panel webviews
    session: new StorageArea('session'),
    onChanged: {
      addListener(listener: OnChangedListener) {
        onChangedListeners.add(listener)
      },
      removeListener(listener: OnChangedListener) {
        onChangedListeners.delete(listener)
      },
      hasListener(listener: OnChangedListener) {
        return onChangedListeners.has(listener)
      },
    },
  },
  runtime: {
    getURL(path: string): string {
      // <base href> points at the webview bundle root, so relative resolution works
      return new URL(path.replace(/^\//, ''), document.baseURI).toString()
    },
    getManifest(): { version: string; name: string } {
      return { version: rpc.getInitPayload().version, name: 'HuddleLLM' }
    },
    // Chrome版では background service worker が CORS 回避のため FETCH_URL を
    // 代理実行していた。VS Code版では fetch 自体がホストへプロキシされるので、
    // ここで直接 fetch して同じ応答契約 {success, content, ...} を返す。
    async sendMessage(message: unknown): Promise<unknown> {
      const msg = message as { type?: string; url?: string; responseType?: string }
      if (msg?.type === 'FETCH_URL' && typeof msg.url === 'string') {
        try {
          const response = await fetch(msg.url)
          if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
          }
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/pdf') || msg.url.toLowerCase().endsWith('.pdf')) {
            return { success: false, error: 'PDF content is not supported.' }
          }
          if (msg.responseType === 'arraybuffer') {
            const buffer = await response.arrayBuffer()
            return { success: true, content: Array.from(new Uint8Array(buffer)), contentType }
          }
          const buffer = await response.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          if (bytes.slice(0, 100).some((b) => b === 0)) {
            return {
              success: false,
              error: 'Binary content detected (PDF, image, or other non-text format). Cannot process as text.',
            }
          }
          let charset = 'utf-8'
          const charsetMatch = contentType.match(/charset=([^;]+)/i)
          if (charsetMatch) {
            charset = charsetMatch[1].toLowerCase()
          }
          let content: string
          try {
            content = new TextDecoder(charset).decode(bytes)
          } catch {
            content = new TextDecoder('utf-8').decode(bytes)
          }
          return {
            success: true,
            content,
            status: response.status,
            statusText: response.statusText,
          }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
      throw new Error(`Browser.runtime.sendMessage is not supported in VS Code (type: ${msg?.type})`)
    },
  },
  tabs: {
    async create(options: { url?: string }): Promise<void> {
      if (options.url) {
        rpc.post({ type: 'ui.openExternal', url: options.url })
      }
    },
    async getZoom(): Promise<number> {
      return currentZoom()
    },
    async setZoom(factor: number): Promise<void> {
      window.localStorage.setItem(ZOOM_KEY, String(factor))
      applyZoomStyle(factor)
    },
  },
  windows: {
    async create(options: { url?: string; [key: string]: unknown }): Promise<void> {
      if (typeof options.url !== 'string') return
      // Chrome版の BTW ポップアップ (app.html#/btw) は補助 webview パネルで開く
      const hashIndex = options.url.indexOf('#')
      if (hashIndex >= 0) {
        rpc.post({ type: 'ui.openPanel', route: options.url.slice(hashIndex + 1) })
        return
      }
      rpc.post({ type: 'ui.openExternal', url: options.url })
    },
  },
  permissions: {
    // VS Code extensions have no host-permission model; everything is granted
    async request(_perms: unknown): Promise<boolean> {
      return true
    },
    async contains(_perms: unknown): Promise<boolean> {
      return true
    },
    async remove(_perms: unknown): Promise<boolean> {
      return true
    },
  },
  commands: {
    async getAll(): Promise<{ name: string; shortcut?: string; description?: string }[]> {
      return [{ name: 'open-app', shortcut: 'Alt+J', description: 'Open HuddleLLM' }]
    },
  },
}

// namespace types referenced as Browser.Permissions.Permissions in one settings panel
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace BrowserTypes {
  namespace Permissions {
    interface Permissions {
      origins?: string[]
      permissions?: string[]
    }
  }
}

export type { BrowserTypes }
export default Browser
