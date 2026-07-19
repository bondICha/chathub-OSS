import { rpc } from './rpc-client'

/**
 * Webview localStorage is not guaranteed to persist, so the host keeps a JSON
 * mirror (KV namespace 'ls'). At startup the snapshot is replayed into the real
 * localStorage (before any app code performs a synchronous read — theme,
 * language, jotai atomWithStorage), then writes are forwarded to the host.
 */
export function initLocalStorageMirror(snapshot: Record<string, string>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // quota or access issues: sync reads will just miss this key
    }
  }

  const proto = Storage.prototype
  const originalSetItem = proto.setItem
  const originalRemoveItem = proto.removeItem
  const originalClear = proto.clear

  proto.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value)
    if (this === window.localStorage) {
      void rpc.kvRequest({ type: 'kv.set', ns: 'ls', items: { [key]: value } })
    }
  }
  proto.removeItem = function (key: string) {
    originalRemoveItem.call(this, key)
    if (this === window.localStorage) {
      void rpc.kvRequest({ type: 'kv.remove', ns: 'ls', keys: [key] })
    }
  }
  proto.clear = function () {
    originalClear.call(this)
    if (this === window.localStorage) {
      void rpc.kvRequest({ type: 'kv.clear', ns: 'ls' })
    }
  }
}
