/** This code is deprecated, please use gemini-api  */

import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
// Streaming removed: use non-stream generateContent only
import { ChatError, ErrorCode } from '~utils/errors'
import { file2base64 } from '~app/utils/file-utils'
import { uuid } from '~utils'
import i18n from '~app/i18n'

type Part =
  | { text: string; thought?: boolean }
  | { inlineData: { data: string; mimeType: string } }

interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

interface ConversationContext {
  messages: Content[]
}

const CONTEXT_SIZE = 120

export class VertexGeminiBot extends AbstractBot {
  private conversationContext?: ConversationContext
  
  // Remove any Markdown-embedded data URL images from text
  private stripInlineImageMarkdown(text: string): string {
    if (!text) return ''
    return text.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '').trim()
  }

  constructor(
    private config: {
      apiKey: string
      host: string
      model: string
      systemMessage: string
      temperature?: number
      thinkingMode?: boolean
      isHostFullPath?: boolean
      webAccess?: boolean
      thinkingBudget?: number
      geminiAuthMode?: 'header' | 'query'
    },
  ) {
    super()
  }

  get name() {
    return `VertexAI Gemini (${this.config.model})`
  }

  get modelName() { return this.config.model }

  get supportsImageInput() { return true }

  setSystemMessage(systemMessage: string) { this.config.systemMessage = systemMessage }

  public setConversationHistory(history: ConversationHistory): void {
    if (history.messages && Array.isArray(history.messages)) {
      const messages: Content[] = history.messages.map((m: any) => ({
        role: m.author === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || '' }],
      }))
      this.conversationContext = { messages }
    }
  }

  public getConversationHistory(): ConversationHistory | undefined {
    if (!this.conversationContext) return undefined
    const messages = this.conversationContext.messages.map((m) => {
      const textPart = (m.parts || []).find((p: any) => (p as any).text)
      return { id: uuid(), author: m.role === 'user' ? 'user' : 'assistant', text: (textPart as any)?.text || '' }
    })
    return { messages }
  }

  private async buildUserContent(prompt: string, images?: File[]): Promise<Content> {
    const parts: Part[] = []
    // Add text first for clarity
    parts.push({ text: prompt || '' })

    if (images && images.length > 0) {
      for (const image of images) {
        const b64 = await file2base64(image)
        parts.push({ inlineData: { data: b64.replace(/^data:[^;]+;base64,/, ''), mimeType: image.type || 'image/jpeg' } })
      }
    }
    return { role: 'user', parts }
  }

  resetConversation() { this.conversationContext = undefined }

  async modifyLastMessage(message: string): Promise<void> {
    if (!this.conversationContext || this.conversationContext.messages.length === 0) return
    const last = this.conversationContext.messages[this.conversationContext.messages.length - 1]
    if (last.role !== 'model') return
    last.parts = [{ text: message }]
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    if (!this.conversationContext) this.conversationContext = { messages: [] }

    const userContent = await this.buildUserContent(params.rawUserInput || params.prompt, params.images)
    const history = (this.conversationContext.messages || []).slice(-CONTEXT_SIZE)
    // Sanitize past assistant messages to avoid embedding image markdown into next requests
    const sanitizedHistory: Content[] = history.map((m) => {
      if (m.role === 'model') {
        const firstText = (m.parts || []).find((p: any) => (p as any).text) as any
        const clean = this.stripInlineImageMarkdown(firstText?.text || '')
        return { role: 'model', parts: [{ text: clean }] }
      }
      return m
    })
    const contents: Content[] = [...sanitizedHistory, userContent]

    const body: any = {
      contents,
      generationConfig: { temperature: this.config.temperature ?? 0.4 },
    }
    // Enable thinking if configured
    if (this.config.thinkingMode) {
      const budget = Math.max(this.config.thinkingBudget ?? 2000, 2000)
      ;(body.generationConfig as any).thinkingConfig = {
        thinkingBudget: budget,
        includeThoughts: true,
      }
    }
    const sys = (this.config.systemMessage && String(this.config.systemMessage).trim().length > 0)
      ? this.config.systemMessage
      : undefined
    if (sys) {
      body.systemInstruction = { parts: [{ text: sys }] }
    }

    // Determine endpoint. Expect full path, optionally with %model placeholder, e.g.:
    // https://api-provider.com/google-vertexai/v1/publishers/google/models/%model:generateContent
    let url = this.config.host || ''
    if (url.includes('%model')) {
      url = url.replace(/%model/g, encodeURIComponent(this.config.model))
    }

    // Force non-stream endpoint if a stream endpoint was provided
    if (url.includes(':streamGenerateContent')) {
      url = url.replace(':streamGenerateContent', ':generateContent')
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Auth handling: header vs query
    let finalUrl = url
    const useQueryAuth = this.config.geminiAuthMode === 'query'
    if (useQueryAuth) {
      // Official style: append ?key=API_KEY
      const sep = finalUrl.includes('?') ? '&' : '?'
      finalUrl = `${finalUrl}${sep}key=${encodeURIComponent(this.config.apiKey)}`
      // Ensure no Authorization header leaks for query mode
      delete (headers as any)['Authorization']
    } else {
      // Gateway style: raw key in Authorization header
      headers['Authorization'] = this.config.apiKey
    }

    const resp = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    })
    // No streaming branch: only non-streaming generateContent supported

    // Non-streaming response handling
    if (!resp.ok) {
      const statusLine = `${resp.status} ${resp.statusText || 'Error'}`
      const txt = await resp.text()
      let cause: any
      let apiMessage = ''
      try { cause = JSON.parse(txt); apiMessage = (cause as any)?.error?.message || '' } catch { cause = txt; apiMessage = txt.substring(0, 300) }
      const combinedMessage = `${statusLine}; ${apiMessage}`
      params.onEvent({ type: 'ERROR', error: new ChatError(combinedMessage, ErrorCode.UNKOWN_ERROR, cause) })
      return
    }

    let data: any
    try {
      data = await resp.json()
    } catch (e) {
      params.onEvent({ type: 'ERROR', error: new ChatError('Invalid JSON from Gemini Vertex endpoint', ErrorCode.UNKOWN_ERROR, e) })
      return
    }

    // Extract text, inline images, and optional thinking
    let finalText = ''
    let finalThinking = ''
    let imageMarkdown = ''
    try {
      const cand = (data?.candidates && Array.isArray(data.candidates)) ? data.candidates[0] : undefined
      const parts = cand?.content?.parts || []
      const textBuf: string[] = []
      const imgBuf: string[] = []
      for (const p of parts as any[]) {
        if (p?.thought) {
          if (p?.text) finalThinking += String(p.text)
        } else if (p?.text) {
          textBuf.push(String(p.text))
        } else if (p?.inlineData?.data) {
          const mime = p?.inlineData?.mimeType || 'image/png'
          const b64 = String(p.inlineData.data)
          imgBuf.push(`![image](data:${mime};base64,${b64})`)
        }
      }
      finalText = (textBuf.join('') || '')
      if (!finalText) finalText = data?.text || ''
      imageMarkdown = imgBuf.length ? `\n\n${imgBuf.join('\n\n')}` : ''
    } catch {}

    if (!finalText) finalText = i18n.t('image_only_response')
    this.conversationContext.messages.push(userContent)
    this.conversationContext.messages.push({ role: 'model', parts: [{ text: finalText }] })
    // Append images only for UI display, not for stored history
    const displayText = (finalText + imageMarkdown).trim()
    this.emitUpdateAnswer(params, { text: displayText, thinking: finalThinking || undefined })
    params.onEvent({ type: 'DONE' })
  }
}
