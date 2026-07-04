import * as vscode from 'vscode'
import { getWebviewHtml } from './html'
import { WebviewRouter, type RouterHost } from './rpc/router'

export const SIDE_VIEW_ID = 'huddlellm.sidePanel'

/**
 * Activity-bar side view: single-bot chat (the Chrome side panel equivalent).
 */
export class SideViewProvider implements vscode.WebviewViewProvider {
  private router: WebviewRouter | undefined

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly host: RouterHost,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    }
    this.router = new WebviewRouter(view.webview, 'sidepanel', this.host)
    view.webview.html = getWebviewHtml(view.webview, this.context.extensionUri)
    view.onDidDispose(() => {
      this.router?.dispose()
      this.router = undefined
    })
  }

  broadcast(msg: Parameters<WebviewRouter['post']>[0]): void {
    this.router?.post(msg)
  }
}
