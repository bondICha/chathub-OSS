import { isArray } from 'lodash-es'
import { DEFAULT_CLAUDE_SYSTEM_MESSAGE } from '~app/consts'
import { requestHostPermission } from '~app/utils/permissions'
import { ClaudeAPIModel, UserConfig } from '~services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { file2base64 } from '../bing/utils'

interface ChatMessage {
  role: string
  content: string | { type: string; [key: string]: any }[]
}

interface ConversationContext {
  messages: ChatMessage[]
}

const CONTEXT_SIZE = 9

export abstract class AbstractClaudeApiBot extends AbstractBot {
  private conversationContext?: ConversationContext

  private buildUserMessage(prompt: string, imageUrl?: string): ChatMessage {
    if (!imageUrl) {
      return { role: 'user', content: prompt }
    }
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageUrl } },
      ],
    }
  }

    private buildMessages(prompt: string, imageUrl?: string): ChatMessage[] {
      return [
        ...this.conversationContext!.messages.slice(-(CONTEXT_SIZE + 1)),
        this.buildUserMessage(prompt, imageUrl),
      ]
    }

  getSystemMessage() {
    return DEFAULT_CLAUDE_SYSTEM_MESSAGE
  }

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    let imageUrl: string | undefined
    if (params.image) {
      imageUrl = await file2base64(params.image)
    }

    const resp = await this.fetchCompletionApi(this.buildMessages(params.prompt, imageUrl), params.signal)

    // add user message to context only after fetch success
    this.conversationContext.messages.push(this.buildUserMessage(params.rawUserInput || params.prompt, imageUrl))

    let done = false
    const result: ChatMessage = { role: 'assistant', content: '' }

    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      const messages = this.conversationContext!.messages
      messages.push(result)
    }

    await parseSSEResponse(resp, (message) => {
      console.debug('claude sse message', message)
      try {
        const data = JSON.parse(message)
        if (data.type === 'content_block_start' || data.type === 'content_block_delta') {
          if (data.delta?.text) {
            if (typeof result.content === 'string') {
              result.content += data.delta.text
            } else {
              result.content = data.delta.text
            }
            params.onEvent({
              type: 'UPDATE_ANSWER',
              data: { text: typeof result.content === 'string' ? result.content : '' },
            })
          }
        } else if (data.type === 'message_stop') {
          finish()
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error)
      }
    })

    if (!done) {
      finish()
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  abstract fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal): Promise<Response>
}

export class ClaudeApiBot extends AbstractClaudeApiBot {
  constructor(
    private config: Pick<
      UserConfig,
      'claudeApiKey' | 'claudeApiModel' | 'claudeApiSystemMessage' | 'claudeApiTemperature'
    >,
  ) {
    super()
  }

  getSystemMessage() {
    return this.config.claudeApiSystemMessage || DEFAULT_CLAUDE_SYSTEM_MESSAGE
  }

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal) {
    const hasImageInput = messages.some(
      (message) => isArray(message.content) && message.content.some((part) => part.type === 'image'),
    )
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.getModelName(),
        messages,
        max_tokens: hasImageInput ? 4096 : 8192,
        stream: true,
        temperature: this.config.claudeApiTemperature,
        system: this.getSystemMessage(),
      }),
    })
    if (!resp.ok) {
      const error = await resp.text()
      if (error.includes('insufficient_quota')) {
        throw new ChatError('Insufficient Claude API usage quota', ErrorCode.CLAUDE_INSUFFICIENT_QUOTA)
      }
      }
    return resp
  }

  private getModelName() {
    const { claudeApiModel } = this.config
    return claudeApiModel
  }

  get name() {
    return `Claude (API/${this.config.claudeApiModel})`
  }

  get supportsImageInput() {
    return true
  }
}
