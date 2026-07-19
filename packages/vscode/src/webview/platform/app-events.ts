import { rpc } from './rpc-client'

export interface AppInitState {
  initialRoute?: string
  pendingQuery?: string
}

/**
 * openSettings / openHistory コマンドや BTW パネルの初期ルートと、
 * Quick Ask コマンド（Chrome拡張の omnibox 相当）のクエリを返す。
 */
export async function getAppInitState(): Promise<AppInitState> {
  const payload = rpc.getInitPayload()
  return { initialRoute: payload.initialRoute, pendingQuery: payload.pendingQuery }
}

export function onQuickAsk(callback: (query: string) => void): () => void {
  rpc.quickAskListeners.add(callback)
  return () => rpc.quickAskListeners.delete(callback)
}

export function onNavigate(callback: (route: string) => void): () => void {
  rpc.routeNavigateListeners.add(callback)
  return () => rpc.routeNavigateListeners.delete(callback)
}

// VS Code テーマ変更時に発火（Auto モードは body の vscode-* クラスで追従する）
export function onThemeChange(callback: () => void): () => void {
  rpc.themeChangeListeners.add(callback)
  return () => rpc.themeChangeListeners.delete(callback)
}

export function reportRoute(route: string): void {
  rpc.post({ type: 'state.route', route })
}
