/**
 * Blob をファイルとして保存する。
 * showSaveFilePicker の SecurityError を避けるため <a download> 方式を使う。
 */
export async function saveBlobViaHost(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
