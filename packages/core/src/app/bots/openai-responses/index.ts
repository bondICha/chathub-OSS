import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { handleResponsesEvent } from '~utils/responses-stream'
import { file2base64 } from '~app/utils/file-utils'

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  | { type: 'image_file'; file_id: string }
  | { type: 'input_file'; filename: string; file_data: string }

type ChatMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | ContentPart[] }

interface ConversationContext { messages: ChatMessage[] }

const CONTEXT_SIZE = 120

export class OpenAIResponsesBot extends AbstractBot {
  private conversationContext?: ConversationContext
  private tools?: any[] // Tool definitions for function calling
  constructor(
    private config: {
      apiKey: string
      host: string
      model: string
      systemMessage: string
      isHostFullPath?: boolean
      webAccess?: boolean
      thinkingMode?: boolean
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
      functionTools?: any[]
      extraBody?: any
    },
  ) {
    super()
  }

  private temporaryOverrides?: { reasoningEffort?: 'none' | 'low' | 'medium' | 'high' }

  setTemporaryOverrides(overrides: { reasoningEffort?: 'none' | 'low' | 'medium' | 'high' }) {
    this.temporaryOverrides = overrides
  }

  get name() {
    return `OpenAI Responses (${this.config.model})`
  }

  get modelName() { return this.config.model }

  get supportsImageInput() { return true }
  get supportsPdfInput() { return true }

  getSystemMessage() {
    return this.config.systemMessage
  }

  setSystemMessage(systemMessage: string) { this.config.systemMessage = systemMessage }

  setTools(tools: any[]) {
    this.tools = tools
  }

  // Runtime toggle for provider web_search_preview usage
  setWebAccessEnabled(enabled: boolean) {
    this.config.webAccess = enabled
  }

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

  private buildUserMessageWithPrevious(prompt: string, imageUrls?: string[], pdfDataUrls?: { filename: string; dataUrl: string }[]): ChatMessage {
    const content: ContentPart[] = []
    content.push({ type: 'text', text: prompt })
    ;(imageUrls || []).forEach((url) => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }))
    ;(pdfDataUrls || []).forEach(({ filename, dataUrl }) => content.push({ type: 'input_file', filename, file_data: dataUrl }))
    return { role: 'user', content }
  }

  private buildMessages(prompt: string, imageUrls?: string[], pdfDataUrls?: { filename: string; dataUrl: string }[]): ChatMessage[] {
    // Unify with Image bot: pass system instructions via top-level `instructions`,
    // not as a system role item in the input array.
    return [
      ...(this.conversationContext?.messages || []).slice(-(CONTEXT_SIZE + 1)),
      this.buildUserMessageWithPrevious(prompt, imageUrls, pdfDataUrls),
    ]
  }

  resetConversation() { this.conversationContext = undefined }

  async modifyLastMessage(message: string): Promise<void> {
    if (!this.conversationContext || this.conversationContext.messages.length === 0) {
      return
    }
    const last = this.conversationContext.messages[this.conversationContext.messages.length - 1] as any
    if (last.role !== 'assistant') {
      return
    }
    // For Responses API, assistant messages are serialized as output_text when sending.
    // Keep internal representation as string for compatibility with existing mapping.
    if (typeof message === 'string') {
      last.content = message
    }
  }

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) this.conversationContext = { messages: [] }

    let imageUrls: string[] = []
    if (params.images?.length) {
      imageUrls = await Promise.all(params.images.map((img) => file2base64(img, true)))
    }

    let pdfDataUrls: { filename: string; dataUrl: string }[] = []
    if (params.pdfFiles?.length) {
      pdfDataUrls = await Promise.all(params.pdfFiles.map(async (f) => ({
        filename: f.name,
        dataUrl: await file2base64(f, true),
      })))
    }

    const messages = this.buildMessages(params.prompt, imageUrls, pdfDataUrls)
    const resp = await this.fetchResponses(messages, params.signal)

    this.conversationContext.messages.push(this.buildUserMessageWithPrevious(params.rawUserInput || params.prompt, imageUrls, pdfDataUrls))

    let done = false
    let resultText = ''
    let imageMarkdown = ''
    let reasoningSummary = ''
    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      // Store only text in assistant history (no Markdown images)
      this.conversationContext!.messages.push({ role: 'assistant', content: resultText })
    }

    await parseSSEResponse(resp, (message, eventName) => {
      if (message === '[DONE]') { finish(); return }
      let data: any
      try { data = JSON.parse(message) } catch { return }
      if (!data) return
      handleResponsesEvent(data, eventName, {
        onTextDelta: (delta) => {
          resultText += delta
          const display = (resultText + imageMarkdown).trim()
          this.emitUpdateAnswer(params, { text: display, thinking: reasoningSummary })
        },
        onTextFinal: (text) => {
          resultText = text || resultText
          const display = (resultText + imageMarkdown).trim()
          this.emitUpdateAnswer(params, { text: display, thinking: reasoningSummary })
        },
        onReasoningDelta: (delta) => {
          reasoningSummary += delta
          const display = (resultText + imageMarkdown).trim()
          this.emitUpdateAnswer(params, { text: display, thinking: reasoningSummary })
        },
        onReasoningFinal: (text) => {
          reasoningSummary = text || reasoningSummary
          const display = (resultText + imageMarkdown).trim()
          this.emitUpdateAnswer(params, { text: display, thinking: reasoningSummary })
        },
        onFunctionCall: (functionCall) => {
          // Emit TOOL_CALL event for Image Agent integration
          try {
            const args = JSON.parse(functionCall.arguments)
            params.onEvent({
              type: 'TOOL_CALL',
              data: {
                id: functionCall.id,
                name: functionCall.name,
                arguments: args
              }
            })
          } catch (error) {
            console.error('Failed to parse function call arguments:', error)
          }
        },
        onCompletedResponse: (response) => {
          // If an image tool was used but streaming events weren't emitted, append the final image from response
          const imgItem = (response?.output || []).find((it: any) => it?.type === 'image_generation_call')
          let raw: any = imgItem?.result ?? imgItem?.image_b64 ?? imgItem?.image_base64 ?? imgItem?.b64_json
          if (Array.isArray(raw)) raw = raw[0]
          const b64 = typeof raw === 'string' ? raw : (raw?.b64_json || raw?.base64 || '')
          const fmt = (imgItem?.output_format || imgItem?.format || 'png') as 'png' | 'jpeg' | 'webp'
          const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png'
          if (b64) {
            imageMarkdown = `\n\n![image](data:${mime};base64,${b64})`
          }
          const revised = imgItem?.revised_prompt
          let tip = ''
          if (revised) {
            tip = `\n\n_Revised prompt:_\n${revised}`
          }

          // Collect reference URLs from url_citation annotations
          const referenceUrlMap = new Map<string, { url: string; title?: string }>()
          const outputItems = Array.isArray(response?.output) ? response.output : []
          for (const item of outputItems) {
            if (item?.type !== 'message') continue
            const contents = Array.isArray(item.content) ? item.content : []
            for (const c of contents) {
              if (!c || c.type !== 'output_text') continue
              const annotations = Array.isArray(c.annotations) ? c.annotations : []
              for (const ann of annotations) {
                if (ann && ann.type === 'url_citation' && typeof ann.url === 'string') {
                  if (!referenceUrlMap.has(ann.url)) {
                    referenceUrlMap.set(ann.url, { url: ann.url, title: ann.title })
                  }
                }
              }
            }
          }
          const referenceUrls = Array.from(referenceUrlMap.values())

          const display = (resultText + imageMarkdown + tip).trim()
          this.emitUpdateAnswer(params, {
            text: display,
            thinking: reasoningSummary,
            referenceUrls: referenceUrls.length > 0 ? referenceUrls : undefined,
          })
        },
        onCompleted: () => finish(),
        onIncomplete: () => finish(),
        onError: (msg, raw) => {
          params.onEvent({ type: 'ERROR', error: new ChatError(msg, ErrorCode.UNKOWN_ERROR, raw) })
          done = true
        },
      })
    })

    if (!done) finish()
  }

  private async fetchResponses(messages: ChatMessage[], signal?: AbortSignal): Promise<Response> {
    const { apiKey, host, isHostFullPath } = this.config
    const baseUrl = isHostFullPath ? host : `${host.replace(/\/$/, '')}/v1/responses`
    // Use top-level instructions (do not inject system item into input)
    const system = (this.config.systemMessage && String(this.config.systemMessage).trim().length > 0)
      ? this.config.systemMessage
      : undefined

    // Map ChatMessage[] to Responses input
    const input: any[] = []
    for (const m of messages) {
      if (m.role === 'user') {
        if (typeof m.content === 'string') input.push({ role: 'user', content: [{ type: 'input_text', text: m.content }] })
        else if (Array.isArray(m.content)) {
          const parts: any[] = []
          for (const p of m.content) {
            if (p.type === 'text') parts.push({ type: 'input_text', text: p.text })
            else if (p.type === 'image_url') parts.push({ type: 'input_image', image_url: p.image_url.url })
            else if ((p as any).type === 'image_file') parts.push({ type: 'input_image', file_id: (p as any).file_id })
            else if ((p as any).type === 'input_file') parts.push({ type: 'input_file', filename: (p as any).filename, file_data: (p as any).file_data })
          }
          input.push({ role: 'user', content: parts })
        }
      } else {
        // Assistant messages must use output_text (not input_text)
        const text = typeof (m as any).content === 'string' ? (m as any).content : ''
        input.push({ role: 'assistant', content: [{ type: 'output_text', text }] })
      }
    }

    // Normalize extraBody
    let extraBodyObj: any | undefined
    if (this.config.extraBody !== undefined) {
      if (typeof this.config.extraBody === 'string') {
        try { extraBodyObj = JSON.parse(this.config.extraBody) } catch (e) { throw new ChatError('Invalid extraBody JSON', ErrorCode.UNKOWN_ERROR, e) }
      } else { extraBodyObj = this.config.extraBody }
    }

    const body: any = {
      model: this.config.model,
      input,
      stream: true,
      ...(system ? { instructions: system } : {}),
      ...(this.config.thinkingMode ? { reasoning: { effort: this.temporaryOverrides?.reasoningEffort ?? this.config.reasoningEffort ?? 'medium' } } : {}),
      ...(extraBodyObj ? { extra_body: extraBodyObj } : {}),
    }

    // Final sanitization: enforce output_text for assistant, input_* for user
    const sanitize = (arr: any[]) => arr.map((item) => {
      const role = item.role
      const content = Array.isArray(item.content) ? item.content : []
      if (role === 'assistant') {
        return { role, content: content.map((c: any) => ({ type: 'output_text', text: c?.text ?? '' })) }
      } else {
        return {
          role,
          content: content.map((c: any) => (
            c?.type === 'input_image' || c?.type === 'input_file'
              ? c
              : { type: 'input_text', text: c?.text ?? '' }
          )),
        }
      }
    })
    body.input = sanitize(body.input)

    // Tools precedence: setTools() > explicit functionTools param > extra_body.tools > web_search_preview toggle
    if (this.tools && Array.isArray(this.tools) && this.tools.length > 0) {
      body.tools = this.tools
    } else if (this.config.functionTools && Array.isArray(this.config.functionTools) && this.config.functionTools.length > 0) {
      body.tools = this.config.functionTools
    } else if (extraBodyObj && Array.isArray((extraBodyObj as any).tools) && (extraBodyObj as any).tools.length > 0) {
      body.tools = (extraBodyObj as any).tools
    } else if (this.config.webAccess) {
      body.tools = [{ type: 'web_search_preview' }]
    }

    const resp = await fetch(baseUrl.replace(/([^:]\/)\/+/g, '$1').replace(/\/v1\/v1\//g, '/v1/'), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const statusLine = `${resp.status} ${resp.statusText || 'Error'}`
      const errorText = await resp.text()
      let cause: any
      try { cause = JSON.parse(errorText) } catch { cause = errorText }
      throw new ChatError(statusLine, ErrorCode.UNKOWN_ERROR, cause)
    }
    return resp
  }
}
