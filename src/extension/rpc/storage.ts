import * as vscode from 'vscode'
import type { KvChange, KvNamespace } from '../../shared/protocol'

/**
 * Key-value backend replacing chrome.storage for the webview:
 *  - 'local' -> JSON files under globalStorageUri (chat history can be large)
 *  - 'sync'  -> globalState Memento (small config, participates in Settings Sync)
 *  - 'ls'    -> JSON file mirror of webview localStorage (webview localStorage is not persistent)
 */
export class KvStorage {
  private localCache = new Map<string, unknown>()
  private localLoaded = false
  private writeQueue: Promise<void> = Promise.resolve()
  private changeListeners: ((ns: KvNamespace, changes: KvChange[]) => void)[] = []

  constructor(private readonly context: vscode.ExtensionContext) {}

  onDidChange(listener: (ns: KvNamespace, changes: KvChange[]) => void): void {
    this.changeListeners.push(listener)
  }

  private emitChanges(ns: KvNamespace, changes: KvChange[]) {
    if (changes.length === 0) return
    for (const listener of this.changeListeners) {
      listener(ns, changes)
    }
  }

  private get localDir(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, 'storage-local')
  }

  private get lsFile(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, 'local-storage.json')
  }

  /** chrome.storage keys may contain characters not valid in filenames */
  private keyToFilename(key: string): string {
    return encodeURIComponent(key) + '.json'
  }

  private filenameToKey(name: string): string {
    return decodeURIComponent(name.replace(/\.json$/, ''))
  }

  async init(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.localDir)
    await this.loadLocalCache()
  }

  private async loadLocalCache(): Promise<void> {
    if (this.localLoaded) return
    const entries = await vscode.workspace.fs.readDirectory(this.localDir)
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.json')) continue
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.localDir, name))
        this.localCache.set(this.filenameToKey(name), JSON.parse(Buffer.from(bytes).toString('utf8')))
      } catch {
        // unreadable entry: skip rather than fail the whole store
      }
    }
    this.localLoaded = true
  }

  private enqueueWrite(fn: () => Promise<void>): Promise<void> {
    this.writeQueue = this.writeQueue.then(fn, fn)
    return this.writeQueue
  }

  private async writeLocalKey(key: string, value: unknown): Promise<void> {
    const target = vscode.Uri.joinPath(this.localDir, this.keyToFilename(key))
    const data = Buffer.from(JSON.stringify(value), 'utf8')
    await vscode.workspace.fs.writeFile(target, data)
  }

  private async deleteLocalKey(key: string): Promise<void> {
    const target = vscode.Uri.joinPath(this.localDir, this.keyToFilename(key))
    try {
      await vscode.workspace.fs.delete(target)
    } catch {
      // already gone
    }
  }

  /* ------------------------------------ ls ------------------------------------ */

  async getLsSnapshot(): Promise<Record<string, string>> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.lsFile)
      return JSON.parse(Buffer.from(bytes).toString('utf8'))
    } catch {
      return {}
    }
  }

  private async setLs(items: Record<string, unknown>, remove?: string[]): Promise<void> {
    const snapshot = await this.getLsSnapshot()
    for (const [k, v] of Object.entries(items)) {
      snapshot[k] = String(v)
    }
    for (const k of remove ?? []) {
      delete snapshot[k]
    }
    await vscode.workspace.fs.writeFile(this.lsFile, Buffer.from(JSON.stringify(snapshot), 'utf8'))
  }

  /* --------------------------------- get/set ---------------------------------- */

  async get(ns: KvNamespace, keys: string[] | null): Promise<Record<string, unknown>> {
    if (ns === 'ls') {
      const snapshot = await this.getLsSnapshot()
      if (keys === null) return snapshot
      const out: Record<string, unknown> = {}
      for (const k of keys) {
        if (k in snapshot) out[k] = snapshot[k]
      }
      return out
    }
    if (ns === 'local') {
      await this.loadLocalCache()
      const out: Record<string, unknown> = {}
      const wanted = keys === null ? [...this.localCache.keys()] : keys
      for (const k of wanted) {
        if (this.localCache.has(k)) out[k] = this.localCache.get(k)
      }
      return out
    }
    // sync
    const out: Record<string, unknown> = {}
    if (keys === null) {
      for (const k of this.context.globalState.keys()) {
        if (k.startsWith(SYNC_PREFIX)) {
          out[k.slice(SYNC_PREFIX.length)] = this.context.globalState.get(k)
        }
      }
      return out
    }
    for (const k of keys) {
      const v = this.context.globalState.get(SYNC_PREFIX + k)
      if (v !== undefined) out[k] = v
    }
    return out
  }

  async set(ns: KvNamespace, items: Record<string, unknown>): Promise<void> {
    const changes: KvChange[] = []
    if (ns === 'ls') {
      await this.enqueueWrite(() => this.setLs(items))
      this.emitChanges(ns, Object.entries(items).map(([key, newValue]) => ({ key, newValue })))
      return
    }
    if (ns === 'local') {
      await this.loadLocalCache()
      for (const [k, v] of Object.entries(items)) {
        changes.push({ key: k, oldValue: this.localCache.get(k), newValue: v })
        this.localCache.set(k, v)
      }
      await this.enqueueWrite(async () => {
        for (const [k, v] of Object.entries(items)) {
          await this.writeLocalKey(k, v)
        }
      })
      this.emitChanges(ns, changes)
      return
    }
    for (const [k, v] of Object.entries(items)) {
      changes.push({ key: k, oldValue: this.context.globalState.get(SYNC_PREFIX + k), newValue: v })
      await this.context.globalState.update(SYNC_PREFIX + k, v)
    }
    this.emitChanges(ns, changes)
  }

  async remove(ns: KvNamespace, keys: string[]): Promise<void> {
    const changes: KvChange[] = []
    if (ns === 'ls') {
      await this.enqueueWrite(() => this.setLs({}, keys))
      this.emitChanges(ns, keys.map((key) => ({ key })))
      return
    }
    if (ns === 'local') {
      await this.loadLocalCache()
      for (const k of keys) {
        changes.push({ key: k, oldValue: this.localCache.get(k) })
        this.localCache.delete(k)
      }
      await this.enqueueWrite(async () => {
        for (const k of keys) {
          await this.deleteLocalKey(k)
        }
      })
      this.emitChanges(ns, changes)
      return
    }
    for (const k of keys) {
      changes.push({ key: k, oldValue: this.context.globalState.get(SYNC_PREFIX + k) })
      await this.context.globalState.update(SYNC_PREFIX + k, undefined)
    }
    this.emitChanges(ns, changes)
  }

  async clear(ns: KvNamespace): Promise<void> {
    if (ns === 'ls') {
      await this.enqueueWrite(async () => {
        await vscode.workspace.fs.writeFile(this.lsFile, Buffer.from('{}', 'utf8'))
      })
      return
    }
    if (ns === 'local') {
      await this.loadLocalCache()
      const keys = [...this.localCache.keys()]
      await this.remove('local', keys)
      return
    }
    const keys = this.context.globalState
      .keys()
      .filter((k) => k.startsWith(SYNC_PREFIX))
      .map((k) => k.slice(SYNC_PREFIX.length))
    await this.remove('sync', keys)
  }
}

const SYNC_PREFIX = 'huddlellm.sync.'
