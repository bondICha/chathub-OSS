import { GoogleGenAI, Content, Part, GenerateContentConfig, HttpOptions } from '@google/genai'
import { ChatError, ErrorCode } from '~utils/errors'
import { AbstractBot, SendMessageParams, ConversationHistory } from '../abstract-bot'
import { file2base64 } from '~app/utils/file-utils'
import { ChatMessageModel } from '~types'
import { uuid } from '~utils'
import { getUserLocaleInfo } from '~utils/system-prompt-variables'
import i18n from '~app/i18n'

// GeminiApiBotのコンストラクタに渡すオプションの型定義
interface GeminiApiBotOptions {
  geminiApiKey: string;
  geminiApiModel: string;
  geminiApiSystemMessage?: string;
  geminiApiTemperature?: number;
  providerWebSearch?: boolean;
  webAccess?: boolean;
  /** Optional custom base URL for advanced routing (e.g., gateways) */
  baseUrl?: string;
  /** Optional API version override when using custom baseUrl */
  apiVersion?: string;
  /** Optional extra HTTP headers (e.g., Authorization for gateways) */
  extraHeaders?: Record<string, string>;
  /** Enable Vertex AI mode (required for Rakuten AI Gateway and other Vertex AI gateways) */
  vertexai?: boolean;
  /** Enable thinking mode (Gemini 2.5+/3+ models) */
  thinkingMode?: boolean;
  /** Thinking budget (Gemini 2.5 models: token count, -1 for dynamic) */
  thinkingBudget?: number;
  /** Thinking level (Gemini 3+ models: 'low' or 'high') */
  thinkingLevel?: 'low' | 'high';
  /** Gemini native image generation config */
  geminiImageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
}

/** Temporary per-session overrides applied via the quick settings balloon */
export interface GeminiTemporaryOverrides {
  temperature?: number;
  thinkingBudget?: number;
  thinkingLevel?: 'low' | 'high';
  geminiImageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
}

interface ConversationContext {
  messages: Content[]
}

const CONTEXT_SIZE = 120

export abstract class AbstractGeminiApiBot extends AbstractBot {
  private conversationContext?: ConversationContext
  protected genAI!: GoogleGenAI

  constructor(genAI: GoogleGenAI) {
    super()
    this.genAI = genAI
  }

  // Subclasses can override this to enable native web tools (e.g., google_search)
  // based on their own configuration.
  protected getWebAccessEnabled(): boolean {
    return false
  }

  // Subclasses can override this to enable thinking mode
  protected getThinkingModeEnabled(): boolean {
    return false
  }

  // Subclasses can override to provide thinking level (Gemini 3+)
  protected getThinkingLevel(): 'low' | 'high' | undefined {
    return undefined
  }

  // Subclasses can override to provide thinking budget (Gemini 2.5)
  protected getThinkingBudget(): number | undefined {
    return undefined
  }

  // Subclasses can override to provide custom tools for function calling
  protected getCustomTools(): any[] | undefined {
    return undefined
  }

  // ConversationHistoryインターフェースの実装
  public async setConversationHistory(history: ConversationHistory): Promise<void> {
    if (history.messages && Array.isArray(history.messages)) {
      const messages: Content[] = history.messages.map(msg => {
        // TODO: Handle images in history
        if (msg.author === 'user') {
          return {
            role: 'user',
            parts: [{ text: msg.text }]
          };
        } else {
          return {
            role: 'model',
            parts: [{ text: msg.text }]
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
    
    const messages = this.conversationContext.messages.map(msg => {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      let text = '';
      
      const textPart = msg.parts?.find(part => 'text' in part) as Part | undefined;
      if (textPart && 'text' in textPart) {
        text = textPart.text || '';
      }
      
      return {
        id: uuid(),
        author: role,
        text: text
        // TODO: Handle images in history
      };
    });
    
    return { messages };
  }

  get supportsPdfInput() { return true }

  private async buildUserContent(prompt: string, images?: File[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]): Promise<Content> {
    const parts: Part[] = [];

    if (images && images.length > 0) {
        for (const image of images) {
            const base64data = await file2base64(image);
            parts.push({
                inlineData: {
                    data: base64data.replace(/^data:.+;base64,/, ''),
                    mimeType: image.type,
                },
            });
        }
    }

    if (audioFiles && audioFiles.length > 0) {
      for (const audio of audioFiles) {
        const base64data = await file2base64(audio);
        parts.push({
          inlineData: {
            data: base64data.replace(/^data:.+;base64,/, ''),
            mimeType: audio.type,
          },
        });
      }
    }

    if (videoFiles && videoFiles.length > 0) {
      for (const video of videoFiles) {
        const base64data = await file2base64(video);
        parts.push({
          inlineData: {
            data: base64data.replace(/^data:.+;base64,/, ''),
            mimeType: video.type,
          },
        });
      }
    }

    if (pdfFiles && pdfFiles.length > 0) {
      for (const pdf of pdfFiles) {
        const base64data = await file2base64(pdf);
        parts.push({
          inlineData: {
            data: base64data.replace(/^data:.+;base64,/, ''),
            mimeType: 'application/pdf',
          },
        });
      }
    }

    parts.push({ text: prompt });
    return { role: 'user', parts };
  }

  abstract getSystemInstruction(): Content | undefined
  abstract getGenerationConfig(): GenerateContentConfig
  abstract getModelName(): string

  async doSendMessage(params: SendMessageParams) {
    if (!this.conversationContext) {
      this.conversationContext = { messages: [] }
    }

    const userMessage = await this.buildUserContent(params.rawUserInput || params.prompt, params.images, params.audioFiles, params.videoFiles, params.pdfFiles);
    
    const history = this.conversationContext.messages.slice(-CONTEXT_SIZE);
    const contents = [...history, userMessage];

    try {
      const systemInstruction = this.getSystemInstruction()
      const config: GenerateContentConfig = this.getGenerationConfig() || {}

      if (systemInstruction) {
        config.systemInstruction = systemInstruction
      }

      // Build tools array: combine custom tools (e.g., from Image Agent) + googleSearch
      const toolsArray: any[] = []

      // Add custom tools if set via setTools()
      const customTools = this.getCustomTools()
      if (customTools && customTools.length > 0) {
        toolsArray.push(...customTools)
      }

      // Add Google Search if enabled
      if (this.getWebAccessEnabled()) {
        const hasGoogleSearch = toolsArray.some((t: any) => t?.googleSearch !== undefined)
        if (!hasGoogleSearch) {
          toolsArray.push({ googleSearch: {} })
        }
      }

      // Apply tools to config
      if (toolsArray.length > 0) {
        ;(config as any).tools = toolsArray
      }

      // Enable thinking mode with thoughts output (only when thinking mode is enabled)
      if (this.getThinkingModeEnabled()) {
        const thinkingConfig: any = { includeThoughts: true }

        // Determine if model is Gemini 3 (uses thinkingLevel) or Gemini 2.5 (uses thinkingBudget)
        const modelName = this.getModelName()
        const isGemini3 = modelName.includes('gemini-3')

        if (isGemini3) {
          // Gemini 3+: use thinkingLevel (default: 'high')
          thinkingConfig.thinkingLevel = this.getThinkingLevel() || 'high'
        } else {
          // Gemini 2.5: use thinkingBudget (if specified)
          const budget = this.getThinkingBudget()
          if (budget !== undefined) {
            thinkingConfig.thinkingBudget = budget
          }
        }

        ;(config as any).thinkingConfig = thinkingConfig
      }

      const requestParams = {
        model: this.getModelName(),
        contents,
        config,
      }

      const result = await this.genAI.models.generateContentStream(requestParams);

      this.conversationContext.messages.push(userMessage);

      // fullText preserves order: text and images interleaved as they arrive in the stream
      let fullText = '';
      let thinkingText = '';
      let lastChunk: any = null;
      let hasFunctionCall = false; // Track if function call was detected
      let hasImages = false;
      for await (const chunk of result) {
        lastChunk = chunk
        // Process all parts in the chunk to separate thoughts from answer
        const candidates = (chunk as any).candidates || []
        const parts = candidates[0]?.content?.parts || []

        for (const part of parts) {
          if (part.thought) {
            // This is thinking content
            thinkingText += part.text || ''
          } else if (part.functionCall) {
            // Function call detected - emit TOOL_CALL event for Image Agent integration
            hasFunctionCall = true
            params.onEvent({
              type: 'TOOL_CALL',
              data: {
                id: (part as any).functionCall.id || crypto.randomUUID(),
                name: (part as any).functionCall.name,
                arguments: (part as any).functionCall.args
              }
            })
          } else if (part.inlineData?.data) {
            // Inline image: convert base64 → Blob → ObjectURL, insert at current position in text
            const mime = part.inlineData.mimeType || 'image/png'
            const b64 = String(part.inlineData.data)
            const binary = atob(b64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const blob = new Blob([bytes], { type: mime })
            const objectUrl = URL.createObjectURL(blob)
            fullText += `\n\n![image](${objectUrl})\n\n`
            hasImages = true
          } else if (part.text) {
            // This is answer content
            fullText += part.text
          }
        }

        // Don't send UPDATE_ANSWER after function call is detected
        // Let Image Agent handle the display with JSON parameters
        if (!hasFunctionCall) {
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: {
              text: fullText,
              thinking: thinkingText || undefined
            }
          })
        }
      }

      // After streaming completes, extract grounding URLs
      const referenceUrls: { url: string; title?: string }[] = []

      try {
        const cand = (lastChunk?.candidates && Array.isArray((lastChunk as any).candidates))
          ? (lastChunk as any).candidates[0]
          : undefined

        // Extract grounding URLs from groundingMetadata
        const groundingMeta = cand?.groundingMetadata
        if (groundingMeta?.groundingChunks) {
          for (const chunk of groundingMeta.groundingChunks) {
            if (chunk?.web?.uri) {
              referenceUrls.push({
                url: chunk.web.uri,
                title: chunk.web.title || undefined
              })
            }
          }
        }
      } catch {
        // ignore parsing errors; text fallback will still work
      }

      if (referenceUrls.length > 0) {
        const finalText = fullText.trim() || i18n.t('image_only_response')
        params.onEvent({
          type: 'UPDATE_ANSWER',
          data: {
            text: finalText,
            thinking: thinkingText || undefined,
            referenceUrls: referenceUrls,
          }
        })
      } else if (!fullText && !hasFunctionCall) {
        // Empty response (and no function call)
        params.onEvent({ type: 'UPDATE_ANSWER', data: { text: i18n.t('image_only_response') } })
      }

      // Don't emit DONE if function call was detected - let Image Agent handle it
      if (!hasFunctionCall) {
        params.onEvent({ type: 'DONE' })
      }
      // Store plain text (without blob URLs) for conversation context
      const textOnly = fullText.replace(/!\[image\]\(blob:[^)]+\)/g, '').trim()
      this.conversationContext.messages.push({ role: 'model', parts: [{ text: textOnly }] })

    } catch (error) {
      console.error('Gemini API error:', error);
      const err = error as any;
      let finalCause = err;
      let finalMessage = err.message || err.toString();

      // Check for nested JSON string in error message
      if (err.message && typeof err.message === 'string') {
        try {
          const nestedError = JSON.parse(err.message);
          if (nestedError.error) {
            finalCause = nestedError.error;
            finalMessage = nestedError.error.message || finalMessage;
          }
        } catch (e) {
          // Not a JSON string, do nothing
        }
      }
      
      const statusLine = `[GoogleGenerativeAI Error]`;
      const combinedMessage = `${statusLine}; ${finalMessage}`;

      params.onEvent({ type: 'ERROR', error: new ChatError(combinedMessage, ErrorCode.GEMINI_API_ERROR, finalCause) });
    }
  }

  async modifyLastMessage(message: string): Promise<void> {
    if (!this.conversationContext || this.conversationContext.messages.length === 0) {
      return
    }
    const lastMessage = this.conversationContext.messages[this.conversationContext.messages.length - 1]
    if (lastMessage.role !== 'model') {
      return
    }
    lastMessage.parts = [{ text: message }]
  }

  resetConversation() {
    this.conversationContext = undefined
  }
}

export class GeminiApiBot extends AbstractGeminiApiBot {
  private config: GeminiApiBotOptions;
  private customTools?: any[];
  private temporaryOverrides?: GeminiTemporaryOverrides;

  constructor(options: GeminiApiBotOptions) {
    const httpOptions: HttpOptions | undefined = (() => {
      const headers: Record<string, string> = options.extraHeaders || {}
      const hasBaseUrl = !!options.baseUrl && options.baseUrl.trim().length > 0

      if (!hasBaseUrl && Object.keys(headers).length === 0 && !options.apiVersion) {
        return undefined
      }

      const result: HttpOptions = {}
      if (hasBaseUrl) {
        result.baseUrl = options.baseUrl
        // For Vertex AI mode, explicitly set empty api_version to prevent SDK from appending default version
        if (options.vertexai) {
          result.apiVersion = options.apiVersion ?? ''
        } else if (options.apiVersion !== undefined) {
          result.apiVersion = options.apiVersion
        }
      }
      if (Object.keys(headers).length > 0) {
        result.headers = headers
      }
      return result
    })()

    const genAI = new GoogleGenAI({
      apiKey: options.geminiApiKey,
      vertexai: options.vertexai ?? false,
      httpOptions,
    });
    super(genAI);
    this.config = options;
  }

  protected getWebAccessEnabled(): boolean {
    return !!(this.config.providerWebSearch ?? this.config.webAccess)
  }

  protected getThinkingModeEnabled(): boolean {
    return !!this.config.thinkingMode
  }

  protected getThinkingLevel(): 'low' | 'high' | undefined {
    return this.temporaryOverrides?.thinkingLevel ?? this.config.thinkingLevel
  }

  protected getThinkingBudget(): number | undefined {
    return this.temporaryOverrides?.thinkingBudget ?? this.config.thinkingBudget
  }

  setTemporaryOverrides(overrides: GeminiTemporaryOverrides) {
    this.temporaryOverrides = overrides
  }

  protected getCustomTools(): any[] | undefined {
    return this.customTools
  }

  // Called via AsyncAbstractBot.setWebAccessEnabled when Web Access is toggled at runtime
  setWebAccessEnabled(enabled: boolean) {
    this.config.webAccess = enabled
  }

  // Set custom tools for function calling (e.g., image generation tools from Image Agent)
  setTools(tools: any[]) {
    this.customTools = tools
  }

  getSystemInstruction(): Content | undefined {
    if (!this.config.geminiApiSystemMessage) {
      return undefined;
    }
    // The new SDK expects system instruction as a top-level parameter, not in contents
    return { role: 'system', parts: [{ text: this.config.geminiApiSystemMessage }] };
  }

  setSystemMessage(systemMessage: string) {
    this.config.geminiApiSystemMessage = systemMessage
  }

  getGenerationConfig(): GenerateContentConfig {
    const cfg: any = {
      temperature: this.temporaryOverrides?.temperature ?? this.config.geminiApiTemperature ?? 0.4,
    };

    // Gemini native image config (aspectRatio, imageSize)
    const imgCfg = this.temporaryOverrides?.geminiImageConfig ?? this.config.geminiImageConfig;
    if (imgCfg) {
      const ic: any = {};
      if (imgCfg.aspectRatio) ic.aspectRatio = imgCfg.aspectRatio;
      if (imgCfg.imageSize) ic.imageSize = imgCfg.imageSize;
      if (Object.keys(ic).length > 0) cfg.imageConfig = ic;
    }

    return cfg;
  }

  public getModelName(): string {
    return this.config.geminiApiModel;
  }
  
  get modelName(): string {
    return this.config.geminiApiModel;
  }

  get name() {
    return `Gemini (API)`
  }

  get supportsImageInput() {
    return true;
  }

  get supportsAudioInput() {
    return true;
  }

  get supportsVideoInput() {
    return true;
  }
}
