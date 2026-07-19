import Browser from 'webextension-polyfill'

export interface AppInitState {
  initialRoute?: string
  pendingQuery?: string
}

/**
 * Chrome 版の保留クエリは omnibox 検索。読み出したらストレージから消す。
 */
export async function getAppInitState(): Promise<AppInitState> {
  try {
    const result = await Browser.storage.local.get('pendingOmniboxSearch')
    const query = result.pendingOmniboxSearch
    if (typeof query === 'string' && query.trim() !== '') {
      await Browser.storage.local.remove('pendingOmniboxSearch')
      return { pendingQuery: query }
    }
  } catch (error) {
    console.error('Error loading pending omnibox search:', error)
  }
  return {}
}

// Chrome 版はホストからのプッシュイベントを持たないため、購読は no-op。
export function onQuickAsk(_callback: (query: string) => void): () => void {
  return () => {}
}

export function onNavigate(_callback: (route: string) => void): () => void {
  return () => {}
}

export function onThemeChange(_callback: () => void): () => void {
  return () => {}
}

export function reportRoute(_route: string): void {}
