import type {
  HostToWebviewMessage,
  InitPayload,
  KvChange,
  KvNamespace,
  WebviewToHostMessage,
} from '../../shared/protocol'
import { getVsCodeApi } from './vscode-api'

export interface FetchStreamHandler {
  onMeta(status: number, statusText: string, headers: [string, string][]): void
  onChunk(base64: string): void
  onDone(): void
  onError(name: string, message: string): void
}

type KvResolver = {
  resolve: (data: Record<string, unknown> | undefined) => void
  reject: (err: Error) => void
}

export type StorageChangeListener = (ns: KvNamespace, changes: KvChange[]) => void
export type ThemeChangeListener = (colorThemeKind: number) => void
export type QuickAskListener = (query: string) => void
export type RouteNavigateListener = (route: string) => void

class RpcClient {
  private readonly vscode = getVsCodeApi()
  private nextId = 1
  private readonly kvPending = new Map<string, KvResolver>()
  private readonly fetchHandlers = new Map<string, FetchStreamHandler>()
  private initPayload: InitPayload | undefined
  private initResolvers: ((payload: InitPayload) => void)[] = []
  readonly storageChangeListeners = new Set<StorageChangeListener>()
  readonly themeChangeListeners = new Set<ThemeChangeListener>()
  readonly quickAskListeners = new Set<QuickAskListener>()
  readonly routeNavigateListeners = new Set<RouteNavigateListener>()

  constructor() {
    window.addEventListener('message', (event) => this.onMessage(event.data as HostToWebviewMessage))
  }

  newId(): string {
    return String(this.nextId++)
  }

  post(msg: WebviewToHostMessage): void {
    this.vscode.postMessage(msg)
  }

  /** Sends 'ready' and resolves once the host answers with 'init'. */
  init(): Promise<InitPayload> {
    if (this.initPayload) return Promise.resolve(this.initPayload)
    const promise = new Promise<InitPayload>((resolve) => this.initResolvers.push(resolve))
    this.post({ type: 'ready' })
    return promise
  }

  getInitPayload(): InitPayload {
    if (!this.initPayload) {
      throw new Error('RPC not initialized: init() must complete before use')
    }
    return this.initPayload
  }

  kvRequest(
    msg:
      | { type: 'kv.get'; ns: KvNamespace; keys: string[] | null }
      | { type: 'kv.set'; ns: KvNamespace; items: Record<string, unknown> }
      | { type: 'kv.remove'; ns: KvNamespace; keys: string[] }
      | { type: 'kv.clear'; ns: KvNamespace },
  ): Promise<Record<string, unknown> | undefined> {
    const id = this.newId()
    return new Promise((resolve, reject) => {
      this.kvPending.set(id, { resolve, reject })
      this.post({ ...msg, id } as WebviewToHostMessage)
    })
  }

  saveFile(filename: string, base64: string): Promise<Record<string, unknown> | undefined> {
    const id = this.newId()
    return new Promise((resolve, reject) => {
      this.kvPending.set(id, { resolve, reject })
      this.post({ type: 'ui.saveFile', id, filename, base64 })
    })
  }

  openFile(options?: { extensions?: string[]; multiple?: boolean }): Promise<Record<string, unknown> | undefined> {
    const id = this.newId()
    return new Promise((resolve, reject) => {
      this.kvPending.set(id, { resolve, reject })
      this.post({ type: 'ui.openFile', id, extensions: options?.extensions, multiple: options?.multiple })
    })
  }

  registerFetch(id: string, handler: FetchStreamHandler): void {
    this.fetchHandlers.set(id, handler)
  }

  unregisterFetch(id: string): void {
    this.fetchHandlers.delete(id)
  }

  private onMessage(msg: HostToWebviewMessage): void {
    switch (msg.type) {
      case 'init': {
        this.initPayload = msg.payload
        const resolvers = this.initResolvers
        this.initResolvers = []
        for (const resolve of resolvers) resolve(msg.payload)
        break
      }
      case 'kv.result': {
        const pending = this.kvPending.get(msg.id)
        if (pending) {
          this.kvPending.delete(msg.id)
          if (msg.ok) pending.resolve(msg.data)
          else pending.reject(new Error(msg.error || 'kv operation failed'))
        }
        break
      }
      case 'fetch.meta':
        this.fetchHandlers.get(msg.id)?.onMeta(msg.status, msg.statusText, msg.headers)
        break
      case 'fetch.chunk':
        this.fetchHandlers.get(msg.id)?.onChunk(msg.base64)
        break
      case 'fetch.done':
        this.fetchHandlers.get(msg.id)?.onDone()
        this.fetchHandlers.delete(msg.id)
        break
      case 'fetch.error':
        this.fetchHandlers.get(msg.id)?.onError(msg.name, msg.message)
        this.fetchHandlers.delete(msg.id)
        break
      case 'storage.changed':
        for (const listener of this.storageChangeListeners) listener(msg.ns, msg.changes)
        break
      case 'theme.changed':
        for (const listener of this.themeChangeListeners) listener(msg.colorThemeKind)
        break
      case 'quick-ask':
        for (const listener of this.quickAskListeners) listener(msg.query)
        break
      case 'route.navigate':
        for (const listener of this.routeNavigateListeners) listener(msg.route)
        break
    }
  }
}

export const rpc = new RpcClient()
