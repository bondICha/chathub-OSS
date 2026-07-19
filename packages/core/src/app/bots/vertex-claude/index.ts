import { requestHostPermission } from '~app/utils/permissions';
import { UserConfig } from '~services/user-config';
import { ChatError, ErrorCode } from '~utils/errors';
import { parseSSEResponse } from '~utils/sse';
import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot';
import { file2base64 } from '~app/utils/file-utils';
import { ChatMessageModel } from '~types';
import { uuid } from '~utils';
import { getUserLocaleInfo } from '~utils/system-prompt-variables';
import { sanitizeMessagesForClaude, ensureNonEmptyText } from '../claude-message-sanitizer';

const CONTEXT_SIZE = 120;

interface ContentPart {
  type: 'text' | 'image' | 'document';
  text?: string;
  image?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  document?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

interface ConversationContext {
  messages: ChatMessage[];
}

export abstract class AbstractVertexClaudeBot extends AbstractBot {
  private conversationContext?: ConversationContext

  get supportsPdfInput() { return true }

  // ConversationHistoryインターフェースの実装
  public setConversationHistory(history: ConversationHistory): void {
    if (history.messages && Array.isArray(history.messages)) {
      // ChatMessageModelからChatMessageへの変換
      const messages: ChatMessage[] = history.messages.map(msg => {
        if (msg.author === 'user') {
          return {
            role: 'user',
            content: [{ type: 'text', text: msg.text }]
          };
        } else {
          return {
            role: 'assistant',
            content: [{ type: 'text', text: msg.text }]
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
      let text = '';
      
      if (Array.isArray(msg.content)) {
        // contentが配列の場合、textプロパティを持つ最初の要素を探す
        const textContent = msg.content.find(part => part.type === 'text' && part.text);
        if (textContent && textContent.text) {
          text = textContent.text;
        }
      }
      
      return {
        id: uuid(),
        author: role,
        text: text
      };
    });
    
    return { messages };
  }

  private buildUserMessage(prompt: string, images?: { data: string, media_type: string }[], pdfs?: { data: string }[]): ChatMessage {
    const content: ContentPart[] = [];

    // Add text content first
    content.push({ type: 'text', text: ensureNonEmptyText(prompt) });

    // Then add images if any
    if (images && images.length > 0) {
      images.forEach(image => {
        content.push({
          type: 'image',
          image: {
            type: 'base64',
            media_type: image.media_type,
            data: image.data
          }
        });
      });
    }

    // Then add PDFs if any
    if (pdfs && pdfs.length > 0) {
      pdfs.forEach(pdf => {
        content.push({
          type: 'document',
          document: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdf.data
          }
        });
      });
    }

    return { role: 'user', content };
  }

  private getMediaTypeFromBase64(base64: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    // base64データの先頭から画像形式を推定
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64.startsWith('R0lGODlh')) return 'image/gif';
    if (base64.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg'; // デフォルト
  }

  private buildMessages(prompt: string, images?: { data: string, media_type: string }[], pdfs?: { data: string }[]): ChatMessage[] {
    // 会話コンテキストからメッセージを取得
    const contextMessages = this.conversationContext!.messages.slice(-(CONTEXT_SIZE + 1));

    // 最初のメッセージがuserかどうかをチェック
    const firstMessageIndex = contextMessages.findIndex(msg => msg.role === 'user');

    // User メッセージが見つからない場合は空の配列を返す
    // User メッセージが見つかった場合は、それ以降のメッセージを使用
    const filteredMessages = firstMessageIndex === -1
      ? []
      : contextMessages.slice(firstMessageIndex);

    // メッセージの順序をチェックして修正
    const result: ChatMessage[] = [];

    for (let i = 0; i < filteredMessages.length; i++) {
      const currentMsg = filteredMessages[i];
      
      if (i === 0 && currentMsg.role !== 'user') {
        // 最初のメッセージがuserでない場合は無視
        continue;
      }

      if (i > 0) {
        const prevMsg = filteredMessages[i - 1];
        const expectedRole = prevMsg.role === 'user' ? 'assistant' : 'user';

        if (currentMsg.role !== expectedRole) {
          // 期待される順序と異なる場合、errorメッセージを挿入
          result.push({
            role: 'assistant',
            content: [{
              type: 'text',
              text: "Error: Message order was incorrect. Conversation has been reset for consistency."
            }]
          });
        }
      }

      result.push(currentMsg);
    }

    return [
      ...result.slice(-(CONTEXT_SIZE - 1)),
      this.buildUserMessage(prompt, images, pdfs),
    ]
  }

  abstract getSystemMessage(): string

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    const images_for_api: { data: string, media_type: string }[] = [];
    if (params.images && params.images.length > 0) {
      for (const image of params.images) {
        const base64Data = await file2base64(image);
        images_for_api.push({
          data: base64Data,
          media_type: image.type,
        });
      }
    }

    const pdfs_for_api: { data: string }[] = [];
    if (params.pdfFiles && params.pdfFiles.length > 0) {
      for (const pdf of params.pdfFiles) {
        const dataUrl = await file2base64(pdf, true);
        const match = dataUrl.match(/^data:.+;base64,(.+)$/);
        if (match) {
          pdfs_for_api.push({ data: match[1] });
        }
      }
    }

    try {
      const resp = await this.fetchCompletionApi(this.buildMessages(params.prompt, images_for_api, pdfs_for_api), params.signal);

      this.conversationContext.messages.push(this.buildUserMessage(params.rawUserInput || params.prompt, images_for_api, pdfs_for_api))
  
      let done = false
      const result: ChatMessage = { 
        role: 'assistant', 
        content: [{ type: 'text', text: '' }] 
      }
      let thinkingContent = '';
      
      const finish = () => {
        done = true
        params.onEvent({ type: 'DONE' })
        this.conversationContext!.messages.push(result)
      }
  
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
  
      let buffer = '';
      while (!done) {
        const { value, done: readerDone } = await reader?.read() || { value: undefined, done: true };
        if (readerDone) {
          finish();
          break;
        }
  
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
  
        for (const event of events) {
          try {
            const lines = event.split('\n');
            let eventType = '';
            let dataLine = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7);
              } else if (line.startsWith('data: ')) {
                dataLine = line.slice(6);
              }
            }

            if (dataLine) {
              const data = JSON.parse(dataLine);
              
              // Handle thinking content block start
              if (eventType === 'content_block_start' && data.content_block?.type === 'thinking') {
                thinkingContent = ''; // Reset thinking content at the start of a new block
              } else if (eventType === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
                // Extended Thinking content processing
                thinkingContent += data.delta.thinking || '';
                params.onEvent({
                  type: 'UPDATE_ANSWER',
                  data: {
                    text: result.content && result.content.length > 0 && result.content[0].type === 'text'
                          ? result.content[0].text || ''
                          : "Empty Response",
                    thinking: thinkingContent,
                  },
                });
              } else if (eventType === 'content_block_delta' && data.delta?.text) {
                // テキスト出力の処理
                if (result.content && result.content.length > 0 && result.content[0].type === 'text') {
                  result.content[0].text += data.delta.text;
                }
                params.onEvent({
                  type: 'UPDATE_ANSWER',
                  data: {
                    text: result.content && result.content.length > 0 && result.content[0].type === 'text'
                          ? result.content[0].text || ''
                          : "Empty Response",
                    thinking: thinkingContent || undefined,
                  },
                });
              } else if (eventType === 'message_stop') {
                finish();
                break;
              }
            }
          } catch (error) {
            console.error('Error parsing stream data:', error);
            params.onEvent({
              type: 'ERROR',
              error: new ChatError('Error parsing stream data', ErrorCode.UNKOWN_ERROR)
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (error instanceof ChatError) {
        params.onEvent({ type: 'ERROR', error });
      } else {
        const err = error as any;
        const message = err.message || 'Unknown error sending message';
        params.onEvent({ type: 'ERROR', error: new ChatError(message, ErrorCode.UNKOWN_ERROR, err) });
      }
    }
  }

  async modifyLastMessage(message: string): Promise<void> {
    console.log('modifyLastMessage', message)
    if (!this.conversationContext || this.conversationContext.messages.length === 0) {
      return
    }

    // 最後のメッセージを取得
    const lastMessage = this.conversationContext.messages[this.conversationContext.messages.length - 1]
    
    // 最後のメッセージがassistantのものでない場合は何もしない
    if (lastMessage.role !== 'assistant') {
      return
    }

    // 新しいコンテンツで最後のメッセージを更新
    if (typeof message === 'string') {
      lastMessage.content = [{ type: 'text', text: message }]
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  abstract fetchCompletionApi(messages: ChatMessage[], signal ?: AbortSignal): Promise<Response>
}

export class VertexClaudeBot extends AbstractVertexClaudeBot {
  private userConfig?: UserConfig;
  private thinkingMode: boolean;
  private temporaryOverrides?: { temperature?: number; thinkingBudget?: number }

  constructor(
    private config: {
      apiKey: string;
      host: string;
      model: string;
      systemMessage: string;
      temperature: number;
      thinkingMode?: boolean;
      thinkingBudget?: number;
      isHostFullPath?: boolean;
      webAccess?: boolean;
      advancedConfig?: any;
    },
  ) {
    super()
    this.thinkingMode = config.thinkingMode ?? false;
  }

  setTemporaryOverrides(overrides: { temperature?: number; thinkingBudget?: number }) {
    this.temporaryOverrides = overrides
  }

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal): Promise<Response> {
    // Full path endpoint; support optional %model placeholder replacement
    let url = this.config.host || '';
    if (url.includes('%model')) {
      url = url.replace(/%model/g, encodeURIComponent(this.config.model));
    }
    
    const requestBody: any = {
      anthropic_version: "vertex-2023-10-16",
      messages: sanitizeMessagesForClaude(messages).map(msg => ({
        role: msg.role,
        content: msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text || '' };
          } else if (part.type === 'image' && part.image) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: part.image.media_type,
                data: part.image.data
              }
            };
          } else if (part.type === 'document' && part.document) {
            return {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: part.document.data
              }
            };
          }
          return { type: 'text', text: '' };
        })
      })),
      system: this.getSystemMessage(),
      stream: true
    };

    if (this.thinkingMode) {
      const budgetTokens = Math.max((this.temporaryOverrides?.thinkingBudget ?? this.config.thinkingBudget) || 2000, 1024);
      requestBody.thinking = {
        type: "enabled",
        budget_tokens: budgetTokens
      };
      // Set max_tokens to budget_tokens + 8000 to avoid 400 Bad Request
      requestBody.max_tokens = Math.min(budgetTokens + 8000, 64000);
    } else {
      requestBody.max_tokens = 16384;
      requestBody.temperature = this.temporaryOverrides?.temperature ?? this.config.temperature;
    }

    const headers: Record<string, string> = {
      'Authorization': this.config.apiKey,
      'Content-Type': 'application/json'
    };

    if (this.config.advancedConfig?.anthropicBetaHeaders) {
      const betaValues = this.config.advancedConfig.anthropicBetaHeaders.split(',').map((v: string) => v.trim()).filter((v: string) => v);
      if (betaValues.length > 0) {
        headers['anthropic-beta'] = betaValues.join(', ');
      }
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

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

    return resp;
  }

  public getModelName() {
    return this.config.model
  }

  get modelName(): string {
    return this.config.model
  }

  get name() {
    return this.thinkingMode ? `VertexAI Claude (Thinking)` : `VertexAI Claude (${this.config.model})`
  }

  get supportsImageInput() {
    return true
  }

  getSystemMessage() {
    return this.config.systemMessage
  }

  setSystemMessage(systemMessage: string) {
    this.config.systemMessage = systemMessage
  }
}
