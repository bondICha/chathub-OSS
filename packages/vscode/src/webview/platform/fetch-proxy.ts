import { fromUint8Array, toUint8Array } from 'js-base64'
import type { SerializedBody, SerializedRequestInit } from '../../shared/protocol'
import { rpc } from './rpc-client'

const nativeFetch = globalThis.fetch.bind(globalThis)

/**
 * Patches globalThis.fetch so that http(s) requests are executed by the
 * extension host (no CORS there). Everything else (webview resources, blob,
 * data URLs) keeps using the native fetch. Installed once at webview startup,
 * before any app code runs — the bots and SSE parsing work unmodified.
 */
export function installFetchProxy(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (!/^https?:/i.test(url)) {
      return nativeFetch(input as RequestInfo, init)
    }
    const request = input instanceof Request ? input : undefined
    return proxyFetch(url, init, request)
  }) as typeof fetch
}

async function proxyFetch(url: string, init?: RequestInit, request?: Request): Promise<Response> {
  const method = init?.method ?? request?.method ?? 'GET'
  const headers = serializeHeaders(init?.headers ?? request?.headers)
  const rawBody = init?.body ?? (request && !['GET', 'HEAD'].includes(method.toUpperCase()) ? await request.blob() : undefined)
  const body = rawBody != null ? await serializeBody(rawBody) : undefined
  if (body?.kind === 'formdata') {
    // the host rebuilds FormData; a stale boundary header would corrupt it
    delete headers['content-type']
    delete headers['Content-Type']
  }

  const serialized: SerializedRequestInit = { method, headers, body }
  const id = rpc.newId()
  const signal = init?.signal ?? request?.signal

  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let settledMeta = false
    let finished = false

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
      cancel() {
        if (!finished) {
          rpc.post({ type: 'fetch.abort', id })
          rpc.unregisterFetch(id)
        }
      },
    })

    const onAbort = () => {
      rpc.post({ type: 'fetch.abort', id })
      rpc.unregisterFetch(id)
      const err = new DOMException('The operation was aborted.', 'AbortError')
      if (!settledMeta) {
        reject(err)
      } else if (!finished) {
        finished = true
        try {
          controller?.error(err)
        } catch {
          // stream already closed
        }
      }
    }

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    rpc.registerFetch(id, {
      onMeta(status, statusText, headerEntries) {
        settledMeta = true
        const respHeaders = new Headers(headerEntries)
        // Response() rejects bodies for null-body statuses
        const bodyAllowed = status !== 204 && status !== 205 && status !== 304
        resolve(new Response(bodyAllowed ? stream : null, { status, statusText, headers: respHeaders }))
      },
      onChunk(base64) {
        try {
          controller?.enqueue(toUint8Array(base64))
        } catch {
          // consumer cancelled the stream
        }
      },
      onDone() {
        finished = true
        signal?.removeEventListener('abort', onAbort)
        try {
          controller?.close()
        } catch {
          // already closed
        }
      },
      onError(name, message) {
        finished = true
        signal?.removeEventListener('abort', onAbort)
        const err = name === 'AbortError' ? new DOMException(message, 'AbortError') : new TypeError(message)
        if (!settledMeta) {
          reject(err)
        } else {
          try {
            controller?.error(err)
          } catch {
            // stream already closed
          }
        }
      },
    })

    rpc.post({ type: 'fetch.start', id, url, init: serialized })
  })
}

function serializeHeaders(headers: HeadersInit | Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
    return out
  }
  return { ...headers }
}

async function serializeBody(body: BodyInit): Promise<SerializedBody> {
  if (typeof body === 'string') {
    return { kind: 'text', text: body }
  }
  if (body instanceof URLSearchParams) {
    return { kind: 'text', text: body.toString() }
  }
  if (body instanceof FormData) {
    const formParts: { name: string; filename?: string; contentType?: string; base64?: string; text?: string }[] = []
    for (const [name, value] of body.entries()) {
      if (typeof value === 'string') {
        formParts.push({ name, text: value })
      } else {
        const buf = new Uint8Array(await value.arrayBuffer())
        formParts.push({
          name,
          filename: value.name || 'blob',
          contentType: value.type || 'application/octet-stream',
          base64: fromUint8Array(buf),
        })
      }
    }
    return { kind: 'formdata', parts: formParts }
  }
  if (body instanceof Blob) {
    return { kind: 'bytes', base64: fromUint8Array(new Uint8Array(await body.arrayBuffer())) }
  }
  if (body instanceof ArrayBuffer) {
    return { kind: 'bytes', base64: fromUint8Array(new Uint8Array(body)) }
  }
  if (ArrayBuffer.isView(body)) {
    return {
      kind: 'bytes',
      base64: fromUint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
    }
  }
  if (body instanceof ReadableStream) {
    // drain the stream; request bodies in this app are small (JSON/uploads)
    const chunks: Uint8Array[] = []
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    return { kind: 'bytes', base64: fromUint8Array(merged) }
  }
  throw new Error('Unsupported request body type for proxied fetch')
}
