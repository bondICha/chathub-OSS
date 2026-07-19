import { rpc } from './rpc-client'

/**
 * VSCode webview では target="_blank" のナビゲーションが素通りされ、何も
 * 起きない。document 全体でクリックを横取りし、ホスト側の
 * vscode.env.openExternal に委譲する。
 */
export function installExternalLinkInterceptor(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    const anchor = (event.target as Element | null)?.closest?.('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) return

    event.preventDefault()
    rpc.post({ type: 'ui.openExternal', url: href })
  })
}
