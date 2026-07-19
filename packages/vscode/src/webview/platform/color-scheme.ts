/**
 * VS Code webview では body に vscode-dark / vscode-light 等が付与される。
 * Auto モードは OS ではなく VS Code のテーマに追従させる。
 */
export function detectPlatformDarkPreference(): boolean | undefined {
  const cls = document.body.classList
  if (cls.contains('vscode-dark') || cls.contains('vscode-high-contrast')) {
    return true
  }
  if (cls.contains('vscode-light') || cls.contains('vscode-high-contrast-light')) {
    return false
  }
  return undefined
}
