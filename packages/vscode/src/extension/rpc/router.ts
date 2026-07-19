import * as os from 'os'
import * as vscode from 'vscode'
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../shared/protocol'
import type { InitPayload, WebviewMode } from '../../shared/protocol'
import { FetchProxy } from './fetch-proxy'
import type { KvStorage } from './storage'

export interface RouterHost {
  readonly storage: KvStorage
  readonly extensionVersion: string
  /** query text queued by the Quick Ask command before a panel existed */
  takePendingQuery(): string | undefined
  /** opens an auxiliary app panel at the given route (BTW popup equivalent) */
  openPanel?(route: string): void
  onRouteChanged?(route: string): void
}

/**
 * Wires one webview to the RPC services. Create one instance per webview
 * (panel and side view each get their own FetchProxy so aborts don't cross).
 */
export class WebviewRouter implements vscode.Disposable {
  private readonly fetchProxy = new FetchProxy()
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly webview: vscode.Webview,
    private readonly mode: WebviewMode,
    private readonly host: RouterHost,
    private readonly initialRoute?: string,
  ) {
    this.disposables.push(webview.onDidReceiveMessage((msg) => this.onMessage(msg as WebviewToHostMessage)))
  }

  post(msg: HostToWebviewMessage): void {
    void this.webview.postMessage(msg)
  }

  private async onMessage(msg: WebviewToHostMessage): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        const payload: InitPayload = {
          mode: this.mode,
          language: vscode.env.language,
          colorThemeKind: vscode.window.activeColorTheme.kind,
          lsSnapshot: await this.host.storage.getLsSnapshot(),
          pendingQuery: this.host.takePendingQuery(),
          initialRoute: this.initialRoute,
          version: this.host.extensionVersion,
        }
        this.post({ type: 'init', payload })
        break
      }
      case 'fetch.start':
        void this.fetchProxy.start(this.webview, msg.id, msg.url, msg.init)
        break
      case 'fetch.abort':
        this.fetchProxy.abort(msg.id)
        break
      case 'kv.get':
        try {
          const data = await this.host.storage.get(msg.ns, msg.keys)
          this.post({ type: 'kv.result', id: msg.id, ok: true, data })
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      case 'kv.set':
        try {
          await this.host.storage.set(msg.ns, msg.items)
          this.post({ type: 'kv.result', id: msg.id, ok: true })
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      case 'kv.remove':
        try {
          await this.host.storage.remove(msg.ns, msg.keys)
          this.post({ type: 'kv.result', id: msg.id, ok: true })
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      case 'kv.clear':
        try {
          await this.host.storage.clear(msg.ns)
          this.post({ type: 'kv.result', id: msg.id, ok: true })
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      case 'ui.openExternal':
        void vscode.env.openExternal(vscode.Uri.parse(msg.url))
        break
      case 'ui.openPanel':
        this.host.openPanel?.(msg.route)
        break
      case 'ui.openKeybindings':
        void vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'huddlellm')
        break
      case 'ui.saveFile':
        try {
          const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(
              vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir()),
              msg.filename,
            ),
          })
          if (target) {
            await vscode.workspace.fs.writeFile(target, Buffer.from(msg.base64, 'base64'))
          }
          this.post({ type: 'kv.result', id: msg.id, ok: true })
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      case 'ui.openFile': {
        try {
          const filters: Record<string, string[]> = {}
          if (msg.extensions?.length) {
            filters['Files'] = msg.extensions.map((e) => e.replace(/^\./, ''))
          }
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: msg.multiple ?? false,
            filters: Object.keys(filters).length ? filters : undefined,
          })
          if (!uris || uris.length === 0) {
            this.post({ type: 'kv.result', id: msg.id, ok: true, data: undefined })
          } else {
            const files = await Promise.all(
              uris.map(async (uri) => {
                const bytes = await vscode.workspace.fs.readFile(uri)
                return {
                  base64: Buffer.from(bytes).toString('base64'),
                  filename: uri.path.split('/').pop() ?? 'file',
                }
              }),
            )
            this.post({ type: 'kv.result', id: msg.id, ok: true, data: { files } })
          }
        } catch (err) {
          this.post({ type: 'kv.result', id: msg.id, ok: false, error: String(err) })
        }
        break
      }
      case 'state.route':
        this.host.onRouteChanged?.(msg.route)
        break
    }
  }

  dispose(): void {
    this.fetchProxy.abortAll()
    for (const d of this.disposables) d.dispose()
  }
}
