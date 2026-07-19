import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { file2base64 } from '~app/utils/file-utils'

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  | { type: 'image_file'; file_id: string }

type ChatMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | ContentPart[] }

interface ConversationContext { messages: ChatMessage[] }

const CONTEXT_SIZE = 120

export class OpenRouterImageBot extends AbstractBot {
  private conversationContext?: ConversationContext
  constructor(
    private config: {
      apiKey: string
      host: string
      model: string
      systemMessage: string
      isHostFullPath?: boolean
      // Optional image options (mapped to aspect_ratio where applicable)
      aspectRatio?: string,
      providerOnly?: string,
    },
  ) {
    super()
  }

  get name() {
    return `OpenRouter Image (${this.config.model})`
  }

  get modelName() { return this.config.model }

  get supportsImageInput() { return true }

  setSystemMessage(systemMessage: string) { this.config.systemMessage = systemMessage }

  public setConversationHistory(history: ConversationHistory): void {
    if (history.messages && Array.isArray(history.messages)) {
      const messages: ChatMessage[] = history.messages.map((m: any) => ({
        role: m.author === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))
      this.conversationContext = { messages }
    }
  }

  public getConversationHistory(): ConversationHistory | undefined {
    if (!this.conversationContext) return undefined
    const messages = this.conversationContext.messages.map((m) => ({
      author: m.role === 'user' ? 'user' : 'assistant',
      text:
        typeof m.content === 'string'
          ? m.content
          : (((m.content as any[]).find((p: any) => p.type === 'text') as any)?.text || ''),
      id: crypto.randomUUID(),
    }))
    return { messages }
  }

  private buildUserMessageWithPrevious(prompt: string, imageUrls?: string[]): ChatMessage {
    const content: ContentPart[] = []
    content.push({ type: 'text', text: prompt })
    ;(imageUrls || []).forEach((url) => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }))
    return { role: 'user', content }
  }

  private buildMessages(prompt: string, imageUrls?: string[]): ChatMessage[] {
    return [
      ...(this.conversationContext?.messages || []).slice(-(CONTEXT_SIZE + 1)),
      this.buildUserMessageWithPrevious(prompt, imageUrls),
    ]
  }

  resetConversation() { this.conversationContext = undefined }

  async modifyLastMessage(message: string): Promise<void> {
    if (!this.conversationContext || this.conversationContext.messages.length === 0) return
    const last = this.conversationContext.messages[this.conversationContext.messages.length - 1] as any
    if (last.role !== 'assistant') return
    if (typeof message === 'string') last.content = message
  }

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) this.conversationContext = { messages: [] }

    let imageUrls: string[] = []
    if (params.images?.length) {
      imageUrls = await Promise.all(params.images.map((img) => file2base64(img, true)))
    }

    const messages = this.buildMessages(params.prompt, imageUrls)
    const resp = await this.fetchChatCompletions(messages, params.signal)

    this.conversationContext.messages.push(this.buildUserMessageWithPrevious(params.rawUserInput || params.prompt, imageUrls))

    let done = false
    let resultText = ''
    let imageMarkdown = ''
    let reasoningSummary = ''
    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      this.conversationContext!.messages.push({ role: 'assistant', content: resultText })
    }

    await parseSSEResponse(resp, (message: string) => {
      if (message === '[DONE]') { finish(); return }
      let data: any
      try { data = JSON.parse(message) } catch { return }
      if (!data) return
      // Streaming shape for chat/completions
      if (data?.choices?.length) {
        const choice = data.choices[0]
        const delta = choice.delta || {}
        if (typeof delta.content === 'string') {
          resultText += delta.content
        }
        if (Array.isArray(delta.images)) {
          // Use first image for preview; may contain multiple
          const first = delta.images[0]
          const url = first?.image_url?.url || ''
          if (url) {
            imageMarkdown = `\n\n![image](${url})`
          }
        }
        const display = (resultText + imageMarkdown).trim()
        this.emitUpdateAnswer(params, { text: display, thinking: reasoningSummary })
      }
    })

    if (!done) finish()
  }

  private buildOpenRouterHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    }
    return headers
  }


  private async fetchChatCompletions(messages: ChatMessage[], signal?: AbortSignal): Promise<Response> {
    const { host, isHostFullPath } = this.config
    const baseUrl = isHostFullPath ? host : `${host.replace(/\/$/, '')}/v1/chat/completions`

    // Build OpenAI Chat messages (system + history + current)
    const chatMessages: any[] = []
    if (this.config.systemMessage && this.config.systemMessage.trim().length > 0) {
      chatMessages.push({ role: 'system', content: this.config.systemMessage })
    }
    for (const m of messages) {
      const c: any = (m as any).content
      if (typeof c === 'string') {
        chatMessages.push({ role: m.role, content: c })
      } else if (Array.isArray(c)) {
        const parts = c
          .map((p: any) => {
            if (p?.type === 'text') {
              return { type: 'text', text: p.text ?? '' }
            }
            if (p?.type === 'image_url') {
              const url = p.image_url?.url || ''
              if (!url) return null
              return { type: 'image_url', image_url: { url } }
            }
            return null
          })
          .filter(Boolean)
        chatMessages.push({ role: m.role, content: parts })
      } else {
        chatMessages.push({ role: m.role, content: '' })
      }
    }

    const body: any = {
      model: this.config.model,
      messages: chatMessages,
      modalities: ['image', 'text'],
      stream: true,
    }
    if (this.config.aspectRatio && this.config.aspectRatio !== 'auto') {
      body.image_config = { aspect_ratio: this.config.aspectRatio }
    }

    if (this.config.providerOnly && this.config.providerOnly.trim().length > 0) {
      body.provider = { only: this.config.providerOnly.split(',').map(s => s.trim()).filter(Boolean) }
    }

    const resp = await fetch(baseUrl.replace(/([^:]\/)\/+/g, '$1').replace(/\/v1\/v1\//g, '/v1/'), {
      method: 'POST',
      signal,
      headers: this.buildOpenRouterHeaders(),
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const statusLine = `${resp.status} ${resp.statusText || 'Error'}`
      const errorText = await resp.text()
      let cause: any
      let apiMessage = ''
      try { cause = JSON.parse(errorText); apiMessage = (cause as any)?.error?.message || '' } catch { cause = errorText; apiMessage = errorText.substring(0, 300) }
      const combinedMessage = `${statusLine}; ${apiMessage}`
      throw new ChatError(combinedMessage, ErrorCode.UNKOWN_ERROR, cause)
    }
    return resp
  }
}
