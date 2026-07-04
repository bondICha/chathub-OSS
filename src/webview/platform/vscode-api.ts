import type { WebviewToHostMessage } from '../../shared/protocol'

interface VsCodeApi {
  postMessage(msg: WebviewToHostMessage): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

let api: VsCodeApi | undefined

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    api = acquireVsCodeApi()
  }
  return api
}
