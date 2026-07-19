import Browser from 'webextension-polyfill'

/**
 * アプリ内ページ（"#/..." のハッシュパス）を新しいタブで開く。
 */
export async function openAppPage(hashPath: string): Promise<void> {
  const url = `${Browser.runtime.getURL('app.html')}${hashPath}`
  await Browser.tabs.create({ url })
}
