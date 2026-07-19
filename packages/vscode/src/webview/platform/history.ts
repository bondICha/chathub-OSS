import { createBrowserHistory, parseHref } from '@tanstack/history'

/**
 * VS Code Webview は <base href="…"> でバンドルルートを基準にしている。
 * @tanstack/history の createHashHistory は createHref で
 *   `${pathname}${search}#${href}`
 * を返すため、<base> がパスを CDN ルートに書き換えて目的地URLが崩れる。
 *
 * ここでは createBrowserHistory の parseLocation/createHref を
 * ハッシュベースルーティングと同じ挙動に上書きして回避する。
 * parseHref は相対パスを分解するだけなので <base> の影響を受けない。
 * createHref は `#${href}` のsame-document参照のみ返す。
 */
export function createAppHistory() {
  return createBrowserHistory({
    parseLocation: () => {
      const hashSplit = window.location.hash.split('#').slice(1)
      const pathPart = hashSplit[0] ?? '/'
      const searchPart = window.location.search
      const hashEntries = hashSplit.slice(1)
      return parseHref(
        `${pathPart}${searchPart}${hashEntries.length === 0 ? '' : `#${hashEntries.join('#')}`}`,
        window.history.state,
      )
    },
    createHref: (href) => `#${href}`,
  })
}
