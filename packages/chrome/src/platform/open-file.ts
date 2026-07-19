import { fileOpen } from 'browser-fs-access'

/**
 * ファイル選択ダイアログを開く。キャンセル時は null / 空配列を返す
 * （VS Code 版のホストダイアログと同じ挙動に揃える）。
 */
export async function openFileViaHost(options?: { extensions?: string[] }): Promise<File | null> {
  try {
    return await fileOpen({ extensions: options?.extensions })
  } catch {
    return null
  }
}

export async function openFilesViaHost(options?: { extensions?: string[] }): Promise<File[]> {
  try {
    return await fileOpen({ multiple: true, extensions: options?.extensions })
  } catch {
    return []
  }
}
