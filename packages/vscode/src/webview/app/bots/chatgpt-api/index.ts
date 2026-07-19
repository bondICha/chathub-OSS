import { isArray } from 'lodash-es'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AsyncAbstractBot, AbstractBot, SendMessageParams, MessageParams, ConversationHistory } from '../abstract-bot'
import { file2base64 } from '~app/utils/file-utils'
import { ChatMessage } from './types'
import { ChatMessageModel } from '~types'
import { uuid } from '~utils'
import { getUserLocaleInfo } from '~utils/system-prompt-variables'

interface ConversationContext {
  messages: ChatMessage[]
}

const CONTEXT_SIZE = 120

export abstract class AbstractChatGPTApiBot extends AbstractBot {
  private conversationContext?: ConversationContext
  protected tools?: any[] // Tool definitions for function calling

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
        // 安全にtextプロパティにアクセス
        const textPart = msg.content.find(part => part.type === 'text');
        if (textPart && 'text' in textPart) {
          content = textPart.text || '';
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

  setTools(tools: any[]) {
    this.tools = tools
  }

  private buildUserMessage(prompt: string, imageUrls?: string[], audioParts?: { data: string; format: string }[], videoUrls?: string[]): ChatMessage {
    const hasImages = imageUrls && imageUrls.length > 0
    const hasAudio = audioParts && audioParts.length > 0
    const hasVideo = videoUrls && videoUrls.length > 0

    if (!hasImages && !hasAudio && !hasVideo) {
      return { role: 'user', content: prompt }
    }

    const content: any[] = [{ type: 'text', text: prompt }];
    if (imageUrls) {
      imageUrls.forEach(imageUrl => {
        content.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } });
      });
    }
    if (audioParts) {
      audioParts.forEach(audio => {
        content.push({ type: 'input_audio', input_audio: { data: audio.data, format: audio.format } });
      });
    }
    if (videoUrls) {
      videoUrls.forEach(videoUrl => {
        content.push({ type: 'video_url', video_url: { url: videoUrl } });
      });
    }

    return {
      role: 'user',
      content: content,
    }
  }

  private buildMessages(prompt: string, imageUrls?: string[], audioParts?: { data: string; format: string }[], videoUrls?: string[]): ChatMessage[] {
    return [
      { role: 'system', content: this.getSystemMessage() },
      ...this.conversationContext!.messages.slice(-(CONTEXT_SIZE + 1)),
      this.buildUserMessage(prompt, imageUrls, audioParts, videoUrls),
    ]
  }

  /**
   * Extract audio format from MIME type for OpenRouter input_audio format.
   * Supported formats: wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24
   * ref: https://openrouter.ai/docs/guides/overview/multimodal/audio
   */
  private extractAudioFormat(mimeType: string): string {
    const formatMap: Record<string, string> = {
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/mpeg3': 'mp3',
      'audio/aiff': 'aiff',
      'audio/x-aiff': 'aiff',
      'audio/aac': 'aac',
      'audio/aacp': 'aac',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/mp4': 'm4a',
      // PCM formats
      'audio/pcm': 'pcm16',
      'audio/pcm;rate=16000': 'pcm16',
      'audio/pcm;rate=24000': 'pcm24',
      'audio/l16': 'pcm16',
      'audio/l24': 'pcm24',
    }
    return formatMap[mimeType.toLowerCase()] || 'wav' // default to wav
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
      lastMessage.content = message
    }
  }

  abstract getSystemMessage(): string

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    let imageUrls: string[] = []
    if (params.images && params.images.length > 0) {
      imageUrls = await Promise.all(
        params.images.map(image => file2base64(image, true))
      )
    }

    // Process audio files for OpenRouter input_audio format
    let audioParts: { data: string; format: string }[] = []
    if (params.audioFiles && params.audioFiles.length > 0) {
      const audioResults = await Promise.all(
        params.audioFiles.map(async (audio) => {
          const base64Data = await file2base64(audio, false) // raw base64 without header
          const format = this.extractAudioFormat(audio.type)
          return { data: base64Data, format }
        })
      )
      audioParts = audioResults
    }

    let videoUrls: string[] = []
    if (params.videoFiles && params.videoFiles.length > 0) {
      videoUrls = await Promise.all(
        params.videoFiles.map(video => file2base64(video, true))
      )
    }

    const resp = await this.fetchCompletionApi(this.buildMessages(params.prompt, imageUrls, audioParts, videoUrls), params.signal)

    // add user message to context only after fetch success
    this.conversationContext.messages.push(this.buildUserMessage(params.rawUserInput || params.prompt, imageUrls, audioParts, videoUrls))

    let done = false
    const result: ChatMessage = { role: 'assistant', content: '' }
    let reasoningSummary = ''
    let currentToolCall: { id: string; name: string; arguments: string } | null = null

    const finish = () => {
      done = true
      params.onEvent({ type: 'DONE' })
      const messages = this.conversationContext!.messages
      messages.push(result)
    }

    await parseSSEResponse(resp, (message) => {
      console.debug('chatgpt sse message', message)
      if (message === '[DONE]') {
        finish()
        return
      }
      let data
      try {
        data = JSON.parse(message)
      } catch (err) {
        console.error(err)
        return
      }
      
      // Handle reasoning summary for OpenAI reasoning models
      if (data?.output && Array.isArray(data.output)) {
        data.output.forEach((item: any) => {
          if (item.type === 'reasoning' && item.summary) {
            // Extract reasoning summary text
            item.summary.forEach((summaryItem: any) => {
              if (summaryItem.type === 'summary_text' && summaryItem.text) {
                reasoningSummary = summaryItem.text
              }
            })
          } else if (item.type === 'message' && item.content) {
            // Extract message content
            item.content.forEach((contentItem: any) => {
              if (contentItem.type === 'output_text' && contentItem.text) {
                result.content = contentItem.text
              }
            })
          }
        })
        // Update the answer with reasoning summary if available
        this.emitUpdateAnswer(params, { 
          text: result.content, 
          thinking: reasoningSummary 
        })
      }
      
      // Handle traditional streaming response (non-reasoning models)
      if (data?.choices?.length) {
        const delta = data.choices[0].delta
        if (delta?.content) {
          result.content += delta.content
          // 思考タグを処理するために共通メソッドを使用
          this.emitUpdateAnswer(params, { text: result.content })
        }

        // Handle tool calls (OpenAI Function Calling format)
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          const toolCall = delta.tool_calls[0]

          if (toolCall.id) {
            // New tool call
            currentToolCall = {
              id: toolCall.id,
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || '',
            }
          } else if (currentToolCall && toolCall.function?.arguments) {
            // Continuation of arguments
            currentToolCall.arguments += toolCall.function.arguments
          }
        }

        // Check if tool call is complete (finish_reason === 'tool_calls')
        if (data.choices[0].finish_reason === 'tool_calls' && currentToolCall) {
          try {
            const parsedArgs = JSON.parse(currentToolCall.arguments)
            params.onEvent({
              type: 'TOOL_CALL',
              data: {
                id: currentToolCall.id,
                name: currentToolCall.name,
                arguments: parsedArgs,
              },
            })
            currentToolCall = null
          } catch (err) {
            console.error('Failed to parse tool call arguments:', err)
          }
        }
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

export class ChatGPTApiBot extends AbstractChatGPTApiBot {
  // Define a specific type for the config needed by ChatGPTApiBot
  constructor(
    private config: {
      apiKey: string;
      host: string;
      model: string;
      temperature: number;
      systemMessage: string;
      isHostFullPath?: boolean;
      webAccess?: boolean;
      thinkingMode?: boolean;
      botIndex?: number; // CustomBotからのインデックス
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high'; // OpenAI reasoning effort
      advancedConfig?: any; // To pass OpenRouter provider options
      extraBody?: any; // Extra body parameters for compatible APIs
      enableAudioInput?: boolean; // OpenRouter audio input support
      enableVideoInput?: boolean; // Enable video input support (e.g. OpenRouter)
    },
  ) {
    super()
  }

  get supportsAudioInput() {
    return !!this.config.enableAudioInput
  }

  private temporaryOverrides?: { temperature?: number; reasoningEffort?: 'none' | 'low' | 'medium' | 'high' }

  setTemporaryOverrides(overrides: { temperature?: number; reasoningEffort?: 'none' | 'low' | 'medium' | 'high' }) {
    this.temporaryOverrides = overrides
  }

  getSystemMessage() {
    return this.config.systemMessage
  }

  setSystemMessage(systemMessage: string) {
    this.config.systemMessage = systemMessage
  }

  

  async fetchCompletionApi(messages: ChatMessage[], signal?: AbortSignal) {

    const model = this.getModelName()

    const { apiKey: openaiApiKey, host: configHost, isHostFullPath: configIsHostFullPath } = this.config;
    
    // Use the values passed from CustomBot (already resolved with common settings)
    const hostValue = configHost;
    const isFullPath = configIsHostFullPath ?? false;
    const apiKeyValue = openaiApiKey;

    let fullUrlStr: string;

    if (isFullPath) {
      fullUrlStr = hostValue;
    } else {
      const api_path = 'v1/chat/completions'; // Default path
      const baseUrl = hostValue.endsWith('/') ? hostValue.slice(0, -1) : hostValue;
      // Ensure v1 is not duplicated if already present in a non-full-path host
      if (baseUrl.endsWith('/v1')) {
        fullUrlStr = `${baseUrl.slice(0, -3)}/${api_path}`;
      } else {
        fullUrlStr = `${baseUrl}/${api_path}`;
      }
      // Clean up potential double slashes or v1/v1 issues more robustly
      fullUrlStr = fullUrlStr.replace(/([^:]\/)\/+/g, "$1"); // Replace multiple slashes with single (but not after scheme like http://)
      fullUrlStr = fullUrlStr.replace(/\/v1\/v1\//g, "/v1/");
    }
    
    const hasImageInput = messages.some(
      (message) => isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
    )
    
    
    const thinkingOn = this.config.thinkingMode;
    
    // Normalize extraBody to object (supports stringified JSON)
    let extraBodyObj: any | undefined;
    if (this.config.extraBody !== undefined) {
      if (typeof this.config.extraBody === 'string') {
        try {
          extraBodyObj = JSON.parse(this.config.extraBody);
        } catch (e) {
          throw new ChatError('Invalid extraBody JSON', ErrorCode.UNKOWN_ERROR, e);
        }
      } else {
        extraBodyObj = this.config.extraBody;
      }
    }
    
    const resp = await fetch(fullUrlStr, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKeyValue}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: undefined,
        stream: true,
        // Add tools if provided (for function calling / tool use)
        ...(this.tools && this.tools.length > 0 && { tools: this.tools }),
        // Add reasoning parameters if Thinking is enabled (for OpenAI-compatible reasoning)
        ...(thinkingOn && {
          reasoning_effort: this.temporaryOverrides?.reasoningEffort ?? this.config.reasoningEffort ?? 'medium'
        }),
        // Include temperature only if Thinking is disabled
        ...((!thinkingOn) && {
          temperature: this.temporaryOverrides?.temperature ?? this.config.temperature
        }),
        // Add OpenRouter specific provider options
        ...(this.config.advancedConfig?.openrouterProviderOnly && {
          provider: {
            only: this.config.advancedConfig.openrouterProviderOnly.split(',').map((p: string) => p.trim()).filter((p: string) => p)
          }
        }),
        // Add extra body parameters if provided
        ...(extraBodyObj ? { extra_body: extraBodyObj } : {}),
      }),
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
        apiMessage = errorText.substring(0, 300); // Take a snippet if not JSON
      }
      const combinedMessage = `${statusLine}; ${apiMessage}`;
      throw new ChatError(combinedMessage, ErrorCode.UNKOWN_ERROR, cause);
    }
    return resp
  }
  

  public getModelName() {
    const { model: chatgptApiModel } = this.config // Use config.model
    return chatgptApiModel
  }

  get modelName(): string { // Add type annotation
    return this.config.model // Use config.model
  }

  get name() {
    return `ChatGPT (API/${this.config.model})` // Use config.model
  }

  get supportsImageInput() {
    return true
  }

  get supportsVideoInput() {
    return this.config.enableVideoInput ?? false
  }

}
