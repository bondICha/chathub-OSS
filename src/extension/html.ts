import * as vscode from 'vscode'

/**
 * Generates the HTML document for both the main panel and the side view.
 * The webview bundle is produced by Vite into dist/webview with stable file
 * names (assets/index.js / assets/index.css). A <base> tag makes hashed lazy
 * chunks, katex fonts and workers resolve relative to the bundle root.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const distRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const baseUri = webview.asWebviewUri(distRoot)
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'index.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'index.css'))
  const nonce = getNonce()

  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    // antd cssinjs / styled-components / mermaid inject inline styles
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} https: data: blob:`,
    // remote APIs go through the host fetch proxy; blob/data for local object URLs
    `connect-src ${webview.cspSource} blob: data:`,
    `worker-src blob: ${webview.cspSource}`,
    `media-src ${webview.cspSource} blob: data:`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${baseUri.toString()}/" />
  <link rel="stylesheet" href="${styleUri.toString()}" />
  <title>HuddleLLM</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
