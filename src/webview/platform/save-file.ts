import { fromUint8Array } from 'js-base64'
import { rpc } from './rpc-client'

/**
 * Webview では <a download> が機能しないため、ホスト側の保存ダイアログ
 * (vscode.window.showSaveDialog) を経由してファイルを保存する。
 */
export async function saveBlobViaHost(blob: Blob, fileName: string): Promise<void> {
  const base64 = fromUint8Array(new Uint8Array(await blob.arrayBuffer()))
  await rpc.saveFile(fileName, base64)
}
