import { isArray } from 'lodash-es'
import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
import { file2base64 } from '~app/utils/file-utils'
import { ChatMessageModel } from '~types'
import { uuid } from '~utils'
import { getUserLocaleInfo } from '~utils/system-prompt-variables'
import { sanitizeMessagesForClaude, ensureNonEmptyText } from '../claude-message-sanitizer'

interface ChatMessage {
  role: string
  content: string | { type: string; [key: string]: any }[]
}

interface ConversationContext {
  messages: ChatMessage[]
}

const CONTEXT_SIZE = 120

export abstract class AbstractClaudeApiBot extends AbstractBot {
  private conversationContext?: ConversationContext

  // ConversationHistoryインターフェースの実装
  public setConversationHistory(history: ConversationHistory): void {
    if (history.messages && Array.isArray(history.messages)) {
      // ChatMessageModelからChatMessageへの変換
      const messages: ChatMessage[] = history.messages.map(msg => {
        if (msg.author === 'user') {
          return {
            role: 'user',
            content: msg.text
          };
        } else {
          return {
            role: 'assistant',
            content: msg.text
          };
        }
      });
      
      this.conversationContext = {
        messages: messages
      };
    }
  }

  public getConversationHistory(): ConversationHistory | undefined {
    if (!this.conversationContext) {
      return undefined;
    }
    
    // ChatMessageからChatMessageModelへの変換
    const messages = this.conversationContext.messages.map(msg => {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      let content = '';
      
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // contentが配列の場合、typeがtextの要素からテキストを抽出
        const textContent = msg.content.find(part => part.type === 'text');
        if (textContent && 'text' in textContent) {
          content = textContent.text || '';
        }
      }
      
      return {
        id: uuid(),
        author: role,
        text: content
      };
    });
    
    return { messages };
  }

  get supportsPdfInput() { return true }

  private async buildUserMessage(prompt: string, images?: File[], pdfFiles?: File[]): Promise<ChatMessage> {
    const hasImages = images && images.length > 0
    const hasPdfs = pdfFiles && pdfFiles.length > 0

    if (!hasImages && !hasPdfs) {
      return { role: 'user', content: ensureNonEmptyText(prompt) }
    }

    const imageContents = hasImages ? await Promise.all(images!.map(async (image) => {
      const dataUrl = await file2base64(image, true)
      const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
      }
      console.error('Could not parse data URL for image:', dataUrl)
      return null
    })) : []

    const pdfContents = hasPdfs ? await Promise.all(pdfFiles!.map(async (pdf) => {
      const dataUrl = await file2base64(pdf, true)
      const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: match[2] } }
      }
      console.error('Could not parse data URL for PDF:', dataUrl)
      return null
    })) : []

    const validContents = [...imageContents, ...pdfContents].filter(content => content !== null)

    return {
      role: 'user',
      content: [
        { type: 'text', text: ensureNonEmptyText(prompt) },
        ...validContents
      ],
    }
  }

  private async buildMessages(prompt: string, images?: File[], pdfFiles?: File[]): Promise<ChatMessage[]> {
    const userMessage = await this.buildUserMessage(prompt, images, pdfFiles);
    return [
      ...this.conversationContext!.messages.slice(-(CONTEXT_SIZE + 1)),
      userMessage,
    ]
  }

  abstract getSystemMessage(): string

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    const messages = await this.buildMessages(params.prompt, params.images, params.pdfFiles);
    const resp = await this.fetchCompletionApi(messages, params.signal)

    // add user message to context only after fetch success
    const userMessage = await this.buildUserMessage(params.rawUserInput || params.prompt, params.images, params.pdfFiles);
    this.conversationContext.messages.push(userMessage);

    let done = false
    const result: ChatMessage = { role: 'assistant', content: '' }
    let thinkingContent = '';
    const referenceUrlMap = new Map<string, { url: string; title?: string }>()

    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      const messages = this.conversationContext!.messages
      messages.push(result)
    }

    let currentToolUse: any = null

    await parseSSEResponse(resp, (message) => {
      console.debug('claude sse message', message)
      try {
        const data = JSON.parse(message)
        if (data.type === 'content_block_start' && data.content_block?.type === 'thinking') {
          thinkingContent = ''; // Reset thinking content at the start of a new block
        } else if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
          // Thinking モードの出力の処理
          thinkingContent += data.delta.thinking || '';
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: {
              text: typeof result.content === 'string' ? result.content : '',
              thinking: thinkingContent,
            },
          });
        } else if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
          // Tool use block started
          currentToolUse = {
            id: data.content_block.id,
            name: data.content_block.name,
            input: '',
          }
        } else if (data.type === 'content_block_start' && data.content_block?.type === 'web_search_tool_result') {
          // Collect reference URLs from web_search_tool_result content blocks
          const contents = Array.isArray(data.content_block.content) ? data.content_block.content : []
          for (const c of contents) {
            if (c && c.type === 'web_search_result' && typeof c.url === 'string') {
              if (!referenceUrlMap.has(c.url)) {
                referenceUrlMap.set(c.url, { url: c.url, title: c.title })
              }
            }
          }
        } else if (data.type === 'content_block_start' && data.content_block?.type === 'text') {
          // Collect reference URLs from citations on text blocks
          const citations = Array.isArray((data.content_block as any).citations)
            ? (data.content_block as any).citations
            : []
          for (const cit of citations) {
            if (
              cit &&
              (cit.type === 'web_search_result_location' || cit.type === 'citations') &&
              typeof cit.url === 'string'
            ) {
              if (!referenceUrlMap.has(cit.url)) {
                referenceUrlMap.set(cit.url, { url: cit.url, title: cit.title })
              }
            }
          }
        } else if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
          // Tool use input delta
          if (currentToolUse) {
            currentToolUse.input += data.delta.partial_json || ''
          }
        } else if (data.type === 'content_block_stop' && currentToolUse) {
          // Tool use block ended - parse and emit
          try {
            const input = JSON.parse(currentToolUse.input)
            params.onEvent({
              type: 'TOOL_CALL',
              data: {
                id: currentToolUse.id,
                name: currentToolUse.name,
                arguments: input,
              },
            })
            // Store in result for conversation context
            if (!Array.isArray(result.content)) {
              result.content = []
            }
            result.content.push({
              type: 'tool_use',
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: input,
            })
          } catch (e) {
            console.error('Failed to parse tool input:', e)
          }
          currentToolUse = null
        } else if (data.type === 'content_block_start' || data.type === 'content_block_delta') {
          if (data.delta?.text) {
            if (typeof result.content === 'string') {
              result.content += data.delta.text
            } else if (Array.isArray(result.content)) {
              // Find or create text block
              const textBlock = result.content.find((b: any) => b.type === 'text')
              if (textBlock) {
                textBlock.text = (textBlock.text || '') + data.delta.text
              } else {
                result.content.push({ type: 'text', text: data.delta.text })
              }
            } else {
              result.content = data.delta.text
            }
            params.onEvent({
              type: 'UPDATE_ANSWER',
              data: {
                text: typeof result.content === 'string'
                  ? result.content
                  : result.content.find((b: any) => b.type === 'text')?.text || '',
                thinking: thinkingContent || undefined,
                referenceUrls: referenceUrlMap.size > 0 ? Array.from(referenceUrlMap.values()) : undefined,
              },
            });
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

    /**
   * modifyLastMessage:
   * conversationContext 内の最後のメッセージが assistant のものであれば、
   * その content を引数 message の内容で上書きします。
   */
  async modifyLastMessage(message: string): Promise<void> {
    if (!this.conversationContext || this.conversationContext.messages.length === 0) {
      return
    }
    const lastMessage = this.conversationContext.messages[this.conversationContext.messages.length - 1]
    if (lastMessage.role !== 'assistant') {
      return
    }
    if (typeof lastMessage.content === 'string') {
      lastMessage.content = message
    } else if (Array.isArray(lastMessage.content)) {
      // parts 配列の場合、先頭要素の text を更新できるようにする
      if (lastMessage.content.length > 0 && typeof lastMessage.content[0].text === 'string') {
        lastMessage.content[0].text = message
      } else {
        lastMessage.content = [{ type: 'text', text: message }]
      }
    }
    console.log('Claude modifyLastMessage updated to:', message)
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  abstract fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal): Promise<Response>
}

export class ClaudeApiBot extends AbstractClaudeApiBot {
  private thinkingMode: boolean;

  // Define a specific type for the config needed by ClaudeApiBot
  constructor(
    private config: {
      apiKey: string;
      host: string;
      model: string;
      systemMessage: string;
      temperature: number;
      thinkingBudget?: number;
      isHostFullPath?: boolean; // Add isHostFullPath to the config type
      webAccess?: boolean;
      advancedConfig?: any;
      tools?: any[]; // Tool definitions for function calling
    },
    thinkingMode: boolean = false,
    private useCustomAuthorizationHeader: boolean = false
  ) {
    super()
    this.thinkingMode = thinkingMode;
  }

  private temporaryOverrides?: { temperature?: number; thinkingBudget?: number }

  setTemporaryOverrides(overrides: { temperature?: number; thinkingBudget?: number }) {
    this.temporaryOverrides = overrides
  }

  getSystemMessage() {
    return this.config.systemMessage
  }

  setSystemMessage(systemMessage: string) {
    this.config.systemMessage = systemMessage
  }

  setTools(tools: any[]) {
    this.config.tools = tools
    console.log('[ClaudeApiBot] setTools called with:', tools)
  }

  // Runtime toggle for provider web_search_20250305 usage
  setWebAccessEnabled(enabled: boolean) {
    if (!this.config.advancedConfig) {
      this.config.advancedConfig = {}
    }
    // Mirror CustomBot's behavior: when providerWebSearch is enabled for Claude,
    // we attach the provider web_search_20250305 tool definition via tools.
    if (enabled) {
      const existingTools = Array.isArray(this.config.tools) ? this.config.tools : [];
      const hasWebSearch = existingTools.some(t => t?.type === 'web_search_20250305');
      if (!hasWebSearch) {
        this.config.tools = [...existingTools, {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        }];
      }
    } else {
      // When disabled, only clear tools if they match the auto-attached web_search tool
      if (Array.isArray(this.config.tools)) {
        const remaining = this.config.tools.filter(
          (t: any) => !(t?.type === 'web_search_20250305' && t?.name === 'web_search'),
        )
        this.config.tools = remaining.length > 0 ? remaining : undefined
      }
    }
  }

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal) {
    const hasImageInput = messages.some(
      (message) => isArray(message.content) && message.content.some((part) => part.type === 'image')
    );

    const body: any = {
      model: this.getModelName(),
      messages: sanitizeMessagesForClaude(messages),
      stream: true,
      system: this.getSystemMessage(),
    }

    // Add tools if provided
    if (this.config.tools && this.config.tools.length > 0) {
      body.tools = this.config.tools;
    }

    // Add Extended Thinking configuration or temperature based on thinkingMode flag
    if (this.thinkingMode) {
      const budgetTokens = Math.max((this.temporaryOverrides?.thinkingBudget ?? this.config.thinkingBudget) || 2000, 1024); // Minimum 1024 tokens as per Extended Thinking spec
      body.thinking = {
        type: "enabled",
        budget_tokens: budgetTokens
      };
      body.max_tokens = Math.min(budgetTokens + 12000, 64000);
      // Temperature is not compatible with Extended Thinking mode
      // Do not set temperature when thinking mode is enabled
    } else {
      body.max_tokens = hasImageInput ? 4096 : 8192;
      body.temperature = this.temporaryOverrides?.temperature ?? this.config.temperature; // Use config.temperature
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    if (this.useCustomAuthorizationHeader) {
      headers['Authorization'] = this.config.apiKey; // Use config.apiKey
    } else {
      headers['x-api-key'] = this.config.apiKey; // Use config.apiKey
    }

    if (this.config.advancedConfig?.anthropicBetaHeaders) {
      const betaValues = this.config.advancedConfig.anthropicBetaHeaders.split(',').map((v: string) => v.trim()).filter((v: string) => v);
      if (betaValues.length > 0) {
        headers['anthropic-beta'] = betaValues.join(', ');
      }
    }

    // Use values passed from CustomBot; do not read global config here
    const { host: hostValue, isHostFullPath: configIsHostFullPath } = this.config;
    const isFullPath = configIsHostFullPath ?? false;

    let fullUrlStr: string;

    if (isFullPath) {
      fullUrlStr = hostValue;
    } else {
      const api_path = 'v1/messages'; // Default path for Claude
      const baseUrl = hostValue.endsWith('/') ? hostValue.slice(0, -1) : hostValue;
      // Ensure v1 is not duplicated if already present in a non-full-path host
      if (baseUrl.endsWith('/v1')) {
        fullUrlStr = `${baseUrl.slice(0, -3)}/${api_path}`;
      } else {
        fullUrlStr = `${baseUrl}/${api_path}`;
      }
      // Clean up potential double slashes or v1/v1 issues more robustly
      fullUrlStr = fullUrlStr.replace(/([^:]\/)\/+/g, "$1"); // Replace multiple slashes with single
      fullUrlStr = fullUrlStr.replace(/\/v1\/v1\//g, "/v1/");
    }

    const resp = await fetch(fullUrlStr, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const statusLine = `${resp.status} ${resp.statusText || 'Error'}`;
      const errorText = await resp.text();
      let cause;
      let apiMessage = '';
      try {
        cause = JSON.parse(errorText);
        apiMessage = (cause as any)?.error?.message || (cause as any)?.error?.type || '';
      } catch (e) {
        cause = errorText;
        apiMessage = errorText.substring(0, 300);
      }
      const combinedMessage = `${statusLine}; ${apiMessage}`;

      if (apiMessage.includes('insufficient_quota')) {
        throw new ChatError(combinedMessage, ErrorCode.CLAUDE_INSUFFICIENT_QUOTA, cause);
      }
      
      throw new ChatError(combinedMessage, ErrorCode.UNKOWN_ERROR, cause);
    }
    return resp
  }

  public getModelName() {
    const { model: claudeApiModel } = this.config // Use config.model
    return claudeApiModel
  }

  get modelName(): string { // Add type annotation
    return this.config.model // Use config.model
  }

  get name(): string { // Add type annotation
    return this.thinkingMode ? `Claude (Thinking)` : `Claude` // Restore getter body
  }

  get supportsImageInput() {
    return true
  }
}
