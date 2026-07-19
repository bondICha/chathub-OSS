/**
 * アプリ内ページ（"#/..." のハッシュパス）を開く。
 * VS Code版はシングルウィンドウ運用: 同一 webview 内でルート遷移する。
 */
export async function openAppPage(hashPath: string): Promise<void> {
  window.location.hash = hashPath
}
