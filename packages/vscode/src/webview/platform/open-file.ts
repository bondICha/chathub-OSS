import { toUint8Array } from 'js-base64'
import { rpc } from './rpc-client'

interface HostFile {
  base64: string
  filename: string
}

async function openFilesRaw(options?: { extensions?: string[]; multiple?: boolean }): Promise<HostFile[]> {
  const result = await rpc.openFile(options)
  if (!result) return []
  const { files } = result as { files: HostFile[] }
  return files ?? []
}

export async function openFileViaHost(options?: { extensions?: string[] }): Promise<File | null> {
  const files = await openFilesRaw({ extensions: options?.extensions, multiple: false })
  if (files.length === 0) return null
  const f = files[0]
  return new File([toUint8Array(f.base64).buffer as ArrayBuffer], f.filename)
}

export async function openFilesViaHost(options?: { extensions?: string[] }): Promise<File[]> {
  const files = await openFilesRaw({ extensions: options?.extensions, multiple: true })
  return files.map((f) => new File([toUint8Array(f.base64).buffer as ArrayBuffer], f.filename))
}
