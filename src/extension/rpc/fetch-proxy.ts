import type * as vscode from 'vscode'
import type { HostToWebviewMessage, SerializedRequestInit } from '../../shared/protocol'

/**
 * Host side of the streaming fetch bridge. The webview cannot call LLM APIs
 * directly (CORS), so requests are executed here with Node's fetch and the
 * response body is streamed back as base64 chunks.
 */
export class FetchProxy {
  private inflight = new Map<string, AbortController>()

  async start(
    webview: vscode.Webview,
    id: string,
    url: string,
    init: SerializedRequestInit,
  ): Promise<void> {
    const controller = new AbortController()
    this.inflight.set(id, controller)
    const post = (msg: HostToWebviewMessage) => webview.postMessage(msg)

    try {
      const resp = await fetch(url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: deserializeBody(init),
        signal: controller.signal,
      })
      await post({
        type: 'fetch.meta',
        id,
        status: resp.status,
        statusText: resp.statusText,
        headers: [...resp.headers.entries()],
      })
      if (resp.body) {
        const reader = resp.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          await post({ type: 'fetch.chunk', id, base64: Buffer.from(value).toString('base64') })
        }
      }
      await post({ type: 'fetch.done', id })
    } catch (err) {
      const e = err as Error
      await post({ type: 'fetch.error', id, name: e.name || 'Error', message: e.message || String(err) })
    } finally {
      this.inflight.delete(id)
    }
  }

  abort(id: string): void {
    this.inflight.get(id)?.abort()
    this.inflight.delete(id)
  }

  abortAll(): void {
    for (const controller of this.inflight.values()) {
      controller.abort()
    }
    this.inflight.clear()
  }
}

function deserializeBody(init: SerializedRequestInit): BodyInit | undefined {
  const body = init.body
  if (!body) return undefined
  switch (body.kind) {
    case 'text':
      return body.text
    case 'bytes':
      return Buffer.from(body.base64, 'base64')
    case 'formdata': {
      const form = new FormData()
      for (const part of body.parts) {
        if (part.base64 !== undefined) {
          const blob = new Blob([Buffer.from(part.base64, 'base64')], {
            type: part.contentType || 'application/octet-stream',
          })
          form.append(part.name, blob, part.filename ?? 'blob')
        } else {
          form.append(part.name, part.text ?? '')
        }
      }
      return form
    }
  }
}
