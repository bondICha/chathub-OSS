import * as vscode from 'vscode'
import { AppPanel, APP_PANEL_VIEW_TYPE, openAuxPanel } from './panel'
import { SideViewProvider, SIDE_VIEW_ID } from './side-view'
import { KvStorage } from './rpc/storage'
import type { RouterHost } from './rpc/router'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = new KvStorage(context)
  await storage.init()

  let pendingQuery: string | undefined

  const host: RouterHost = {
    storage,
    extensionVersion: (context.extension.packageJSON as { version: string }).version,
    takePendingQuery() {
      const q = pendingQuery
      pendingQuery = undefined
      return q
    },
    openPanel(route: string) {
      openAuxPanel(context, host, route)
    },
  }

  const sideView = new SideViewProvider(context, host)

  // keep panel and side view coherent when either writes to storage
  storage.onDidChange((ns, changes) => {
    const msg = { type: 'storage.changed' as const, ns, changes }
    AppPanel.instance?.broadcast(msg)
    sideView.broadcast(msg)
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('huddlellm.open', () => {
      // Chrome版の onInstalled → welcome ページ表示に相当: 初回のみ /welcome を開く
      const welcomed = context.globalState.get<boolean>('huddlellm.welcomed')
      if (!welcomed) {
        void context.globalState.update('huddlellm.welcomed', true)
        AppPanel.createOrShow(context, host, '/welcome')
        return
      }
      AppPanel.createOrShow(context, host)
    }),
    vscode.commands.registerCommand('huddlellm.openSettings', () => {
      AppPanel.createOrShow(context, host, '/setting')
    }),
    vscode.commands.registerCommand('huddlellm.openHistory', () => {
      AppPanel.createOrShow(context, host, '/history')
    }),
    vscode.commands.registerCommand('huddlellm.quickAsk', async () => {
      const query = await vscode.window.showInputBox({
        title: 'HuddleLLM: Quick Ask',
        prompt: 'Ask all bots in the current layout',
        placeHolder: 'Type your question…',
      })
      if (!query || !query.trim()) return
      if (AppPanel.instance) {
        AppPanel.instance.postQuickAsk(query.trim())
      } else {
        pendingQuery = query.trim()
        AppPanel.createOrShow(context, host)
      }
    }),
    vscode.commands.registerCommand('huddlellm.openInMainTab', () => {
      AppPanel.createOrShow(context, host)
    }),
    vscode.window.registerWebviewViewProvider(SIDE_VIEW_ID, sideView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      const msg = { type: 'theme.changed' as const, colorThemeKind: theme.kind }
      AppPanel.instance?.broadcast(msg)
      sideView.broadcast(msg)
    }),
  )

  // restore the app panel across window reloads
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(APP_PANEL_VIEW_TYPE, {
        deserializeWebviewPanel(panel: vscode.WebviewPanel) {
          const route = context.globalState.get<string>('huddlellm.lastRoute')
          AppPanel.restore(context, host, panel, route)
          return Promise.resolve()
        },
      }),
    )
  }
}

export function deactivate(): void {
  // nothing to clean up; disposables are handled via context.subscriptions
}
