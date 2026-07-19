/**
 * UNUSED: This bot is no longer used in runtime.
 * Image generation is now handled by OpenAIResponsesBot with an image_generation tool.
 * We keep this file for reference and to present a separate provider option in UI.
 */
import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { handleResponsesEvent } from '~utils/responses-stream'
import { file2base64 } from '~app/utils/file-utils'

type Size = '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
type Quality = 'low' | 'medium' | 'high' | 'auto'
type Background = 'transparent' | 'auto'

interface OpenAIImageBotOptions {
  apiKey: string
  host: string
  isHostFullPath?: boolean
  model: string // e.g. gpt-image-1 or a mainline model that can call the tool
  size?: Size
  quality?: Quality
  background?: Background
  // Output options
  format?: 'png' | 'jpeg' | 'webp' | 'none'
  compression?: number // 0-100, only for jpeg/webp
  // Moderation strictness for gpt-image-1 tool
  moderation?: 'default' | 'low' | 'auto'
}

export class OpenAIImageBot extends AbstractBot {
  private config: OpenAIImageBotOptions
  private conversationContext?: { messages: Array<
    | { role: 'system' | 'assistant'; content: string | any[] }
    | { role: 'user'; content: string | any[] }
  > }
  constructor(options: OpenAIImageBotOptions) {
    super()
    this.config = options
  }

  get name() { return 'OpenAI Image (Conversational)' }
  get modelName() { return this.config.model }
  setSystemMessage(systemMessage: string) {
    // Store as first system message in context
    if (!this.conversationContext) this.conversationContext = { messages: [] }
    // Replace existing system or prepend
    const others = (this.conversationContext.messages || []).filter(m => m.role !== 'system')
    this.conversationContext.messages = [{ role: 'system', content: systemMessage }, ...others]
  }

  public setConversationHistory(history: ConversationHistory): void {
    // Map to simple text-only history; images from previous assistant are embedded later when generated in this bot
    if (history.messages && Array.isArray(history.messages)) {
      const msgs = history.messages.map((m: any) => ({ role: m.author === 'user' ? 'user' : 'assistant', content: m.text }))
      this.conversationContext = { messages: msgs as any[] }
    }
  }

  public getConversationHistory(): ConversationHistory | undefined {
    if (!this.conversationContext) return undefined
    const messages = this.conversationContext.messages.map((m: any) => ({ id: crypto.randomUUID(), author: m.role === 'user' ? 'user' : 'assistant', text: typeof m.content === 'string' ? m.content : '' }))
    return { messages }
  }

  resetConversation(): void { this.conversationContext = undefined }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    try {
      const baseUrl = this.config.isHostFullPath ? this.config.host : `${this.config.host.replace(/\/$/, '')}/v1/responses`

      if (!this.conversationContext) this.conversationContext = { messages: [] }

      const parts: any[] = [{ type: 'input_text', text: params.prompt }]
      if (params.images?.length) {
        // Keep data URL header so image_url is a valid URL (data:...)
        const base64s = await Promise.all(params.images.map((img) => file2base64(img, true)))
        for (const b64 of base64s) {
          parts.push({ type: 'input_image', image_url: b64 })
        }
      }

      const tool: any = { type: 'image_generation' }
      if (this.config.quality) tool.quality = this.config.quality
      if (this.config.background) tool.background = this.config.background
      if (this.config.size) tool.size = this.config.size
      // Moderation: default selection maps to 'low' as per product decision
      if (this.config.moderation) {
        tool.moderation = this.config.moderation === 'default' ? 'low' : this.config.moderation
      }
      // Output format and compression (omit when 'none')
      if (this.config.format && this.config.format !== 'none') {
        tool.format = this.config.format
        if (typeof this.config.compression === 'number' && (this.config.format === 'jpeg' || this.config.format === 'webp')) {
          const clamped = Math.max(0, Math.min(100, Math.round(this.config.compression)))
          tool.output_compression = clamped
        }
      }

      // Extract latest system message (use as `instructions`), and build history without system
      const allCtx = (this.conversationContext.messages || []).slice(-120).filter(Boolean)
      let instructions: string | undefined
      const history = allCtx.filter((m: any) => {
        if (m.role === 'system') {
          const txt = typeof m.content === 'string' ? m.content
            : Array.isArray(m.content) ? (m.content.find((c: any) => c?.type === 'input_text')?.text || '')
            : String(m.content ?? '')
          if (txt) instructions = txt
          return false
        }
        return true
      })
      const input = [
        ...history.map((m: any) => {
          const role = m.role
          const raw = m.content
          if (role === 'assistant') {
            // Always collapse to a single output_text for safety
            let text = ''
            if (typeof raw === 'string') {
              text = raw
            } else if (Array.isArray(raw)) {
              text = raw.map((it: any) => {
                if (it?.type === 'output_text') return it.text || ''
                if (it?.type === 'input_text') return it.text || ''
                if (it?.type === 'input_image' && it.image_url) return `![image](${it.image_url})`
                return ''
              }).filter(Boolean).join('\n\n')
            } else {
              text = String(raw ?? '')
            }
            return { role: 'assistant', content: [{ type: 'output_text', text }] }
          } else {
            // user messages must be input_* only
            if (typeof raw === 'string') return { role: 'user', content: [{ type: 'input_text', text: raw }] }
            if (Array.isArray(raw)) {
              const items: any[] = []
              for (const it of raw) {
                if (it?.type === 'input_text' || it?.type === 'input_image') items.push(it)
                else if (it?.type === 'output_text') items.push({ type: 'input_text', text: it.text })
              }
              return { role: 'user', content: items.length ? items : [{ type: 'input_text', text: '' }] }
            }
            return { role: 'user', content: [{ type: 'input_text', text: String(raw ?? '') }] }
          }
        }),
        { role: 'user', content: parts },
      ]

      // Final safety sanitation: ensure assistant has only output_text/refusal and user has only input_* types
      let sanitizedInput = input.map((item: any) => {
        const role = item.role
        const content = Array.isArray(item.content) ? item.content : []
        if (role === 'assistant') {
          const out = content.map((c: any) => ({ type: 'output_text', text: c?.text ?? '' }))
          return { role: 'assistant', content: out }
        } else {
          const out = content.map((c: any) => (c?.type === 'input_image' ? c : { type: 'input_text', text: c?.text ?? '' }))
          return { role: 'user', content: out }
        }
      })

      const body: any = { model: this.config.model, input: sanitizedInput, tools: [tool], stream: true }
      if (instructions) body.instructions = instructions

      const resp = await fetch(baseUrl.replace(/([^:]\/)\/+/g, '$1').replace(/\/v1\/v1\//g, '/v1/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        signal: params.signal,
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const statusLine = `${resp.status} ${resp.statusText || 'Error'}`
        const text = await resp.text()
        let cause: any
        try { cause = JSON.parse(text) } catch { cause = text }
        throw new ChatError(statusLine, ErrorCode.UNKOWN_ERROR, cause)
      }

      let done = false
      let latestImageMarkdown = ''
      let textSoFar = ''
      let finalImageDataUrl = ''

      const finish = () => { done = true; params.onEvent({ type: 'DONE' }) }
      await parseSSEResponse(resp, (msg, eventName?: string) => {
        if (msg === '[DONE]') { finish(); return }
        let data: any
        try { data = JSON.parse(msg) } catch { return }
        if (!data) return
        handleResponsesEvent(data, eventName, {
          onTextDelta: (delta) => {
            textSoFar += delta
            params.onEvent({ type: 'UPDATE_ANSWER', data: { text: textSoFar + (latestImageMarkdown ? `\n\n${latestImageMarkdown}` : '') } })
          },
          onImagePartial: (b64) => {
            latestImageMarkdown = `![image](data:image/png;base64,${b64})`
            params.onEvent({ type: 'UPDATE_ANSWER', data: { text: textSoFar + `\n\n${latestImageMarkdown}` } })
          },
          onImageDone: (b64) => {
            latestImageMarkdown = `![image](data:image/png;base64,${b64})`
            finalImageDataUrl = `data:image/png;base64,${b64}`
            params.onEvent({ type: 'UPDATE_ANSWER', data: { text: textSoFar + `\n\n${latestImageMarkdown}` } })
          },
          onCompletedResponse: (response) => {
            // Fallback: if we didn't receive image partial/done events, try to pick from completed response
            const imgItem = (response?.output || []).find((it: any) => it?.type === 'image_generation_call')
            // Normalize possible shapes
            let raw: any = imgItem?.result ?? imgItem?.image_b64 ?? imgItem?.image_base64 ?? imgItem?.b64_json
            if (Array.isArray(raw)) raw = raw[0]
            const b64 = typeof raw === 'string' ? raw : (raw?.b64_json || raw?.base64 || '')
            const fmt = (imgItem?.output_format || imgItem?.format || this.config.format || 'png') as 'png' | 'jpeg' | 'webp'
            const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png'
            if (b64) {
              latestImageMarkdown = `![image](data:${mime};base64,${b64})`
              finalImageDataUrl = `data:${mime};base64,${b64}`
              params.onEvent({ type: 'UPDATE_ANSWER', data: { text: textSoFar + `\n\n${latestImageMarkdown}` } })
            }
            // Show revised_prompt if present for user clarity
            const revised = imgItem?.revised_prompt
            if (revised) {
              const tip = `\n\n_Revised prompt:_\n${revised}`
              params.onEvent({ type: 'UPDATE_ANSWER', data: { text: (textSoFar + (latestImageMarkdown ? `\n\n${latestImageMarkdown}` : '') + tip).trim() } })
            }
          },
          onCompleted: () => finish(),
          onIncomplete: () => finish(),
          onError: (msg, raw) => {
            params.onEvent({ type: 'ERROR', error: new ChatError(msg, ErrorCode.UNKOWN_ERROR, raw) })
          },
        })
      })
      if (!done) finish()

      // Append to conversation context for multi-turn editing (store assistant output image as content)
      const assistantContent = [] as any[]
      const combinedText = textSoFar + (latestImageMarkdown ? `\n\n${latestImageMarkdown}` : '')
      if (combinedText) assistantContent.push({ type: 'output_text', text: combinedText })
      // Do not include input_* types in assistant messages; Responses API expects output_text/refusal
      this.conversationContext.messages.push({ role: 'user', content: [{ type: 'input_text', text: params.prompt }] })
      if (params.images?.length) {
        for (const img of await Promise.all(params.images.map((i) => file2base64(i, true)))) {
          this.conversationContext.messages.push({ role: 'user', content: [{ type: 'input_image', image_url: img }] })
        }
      }
      this.conversationContext.messages.push({ role: 'assistant', content: assistantContent.length ? assistantContent : [{ type: 'output_text', text: textSoFar }] })
    } catch (e) {
      params.onEvent({ type: 'ERROR', error: e as ChatError })
    }
  }
}
