/**
 * Drop-in replacement for `webextension-polyfill`, aliased via tsconfig paths.
 * chrome.storage.local/sync are bridged to the extension host (JSON files /
 * globalState); the other namespaces implement just enough surface for the
 * ported code to run inside a VS Code webview.
 */
import type { KvChange, KvNamespace } from '../../shared/protocol'
import { rpc } from './rpc-client'

type StorageItems = Record<string, unknown>
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

/** chrome.storage.session equivalent: webview-lifetime only, in memory. */
class SessionStorageArea {
  private items: StorageItems = {}

  async get(keys?: GetKeys): Promise<StorageItems> {
    const { wanted, defaults } = normalizeGet(keys)
    const out: StorageItems = { ...defaults }
    for (const k of wanted ?? Object.keys(this.items)) {
      if (k in this.items) out[k] = this.items[k]
    }
    return out
  }

  async set(items: StorageItems): Promise<void> {
    Object.assign(this.items, items)
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete this.items[k]
  }

  async clear(): Promise<void> {
    this.items = {}
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
    session: new SessionStorageArea(),
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
    async sendMessage(_message: unknown): Promise<unknown> {
      throw new Error('Browser.runtime.sendMessage is not available in VS Code')
    },
  },
  tabs: {
    async create(options: { url?: string }): Promise<void> {
      if (options.url) {
        rpc.post({ type: 'ui.openExternal', url: options.url })
      }
    },
    async getZoom(): Promise<number> {
      return 1
    },
    async setZoom(_factor: number): Promise<void> {
      // no-op: zoom is managed by VS Code itself
    },
  },
  windows: {
    async create(options: { url?: string }): Promise<void> {
      if (options.url) {
        rpc.post({ type: 'ui.openExternal', url: options.url })
      }
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
