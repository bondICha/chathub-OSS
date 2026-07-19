import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractChatGPTApiBot } from '../chatgpt-api'
import { ChatMessage } from '../chatgpt-api/types'
import { isArray } from 'lodash-es'

export class GeminiOpenAICompatBot extends AbstractChatGPTApiBot {
  constructor(
    private config: {
      apiKey: string;
      host: string;
      model: string;
      temperature: number;
      systemMessage: string;
      webAccess?: boolean;
      botIndex?: number;
      thinkingMode?: boolean;
      thinkingBudget?: number;
    },
  ) {
    super()
  }

  getSystemMessage() {
    return this.config.systemMessage
  }

  setSystemMessage(systemMessage: string) {
    this.config.systemMessage = systemMessage
  }

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal) {
    const model = this.getModelName()

    const { apiKey: geminiApiKey, host: configHost } = this.config;

    // Gemini OpenAI Compat always uses full path URL
    const fullUrlStr = configHost || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

    const hasImageInput = messages.some(
      (message) => isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
    )

    const requestBody: any = {
      model,
      messages,
      max_tokens: undefined,
      stream: true,
      temperature: this.config.temperature,
    }

    // Add Google thinking config if thinking mode is enabled
    if (this.config.thinkingMode) {
      requestBody.extra_body = {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_budget: this.config.thinkingBudget || 2000,
          }
        }
      }
    }

    const resp = await fetch(fullUrlStr, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${geminiApiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!resp.ok) {
      const statusLine = `${resp.status} ${resp.statusText || 'Error'}`;
      const errorText = await resp.text();
      let cause;
      let apiMessage = '';
      try {
        cause = JSON.parse(errorText);
        apiMessage = (cause as any)?.error?.message || '';
      } catch (e) {
        cause = errorText;
        apiMessage = errorText.substring(0, 300);
      }
      const combinedMessage = `${statusLine}; ${apiMessage}`;
      throw new ChatError(combinedMessage, ErrorCode.UNKOWN_ERROR, cause);
    }
    return resp
  }

  public getModelName() {
    return this.config.model
  }

  get modelName(): string {
    return this.config.model
  }

  get name() {
    return `Gemini OpenAI Compat (${this.config.model})`
  }

  get supportsImageInput() {
    return true
  }
}