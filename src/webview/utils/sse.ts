import { createParser } from 'eventsource-parser'
import { isEmpty } from 'lodash-es'
import { ChatError, ErrorCode } from './errors'
import { streamAsyncIterable } from './stream-async-iterable'

const statusTextMap = new Map([
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [429, 'Too Many Requests'],
])

export async function parseSSEResponse(
  resp: Response,
  onMessage: (message: string, eventName?: string) => void,
) {
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}))
    if (!isEmpty(error)) {
      throw new Error(JSON.stringify(error))
    }
    const statusText = resp.statusText || statusTextMap.get(resp.status) || ''
    throw new ChatError(`${resp.status} ${statusText}`, ErrorCode.NETWORK_ERROR)
  }
  const parser = createParser((event) => {
    if (event.type === 'event') {
      // Pass both data payload and SSE event name to consumers
      onMessage(event.data, (event as any).event ?? undefined)
    }
  })
  const decoder = new TextDecoder()
  for await (const chunk of streamAsyncIterable(resp.body!)) {
    const str = decoder.decode(chunk)
    parser.feed(str)
  }
}
