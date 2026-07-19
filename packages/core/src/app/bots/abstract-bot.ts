import { Sentry } from '~services/sentry'
import { ChatError, ErrorCode } from '~utils/errors'
import { streamAsyncIterable } from '~utils/stream-async-iterable'
import { ThinkingParser } from '~utils/thinking-parser'
import { replaceSystemPromptVariables, getCurrentDateTime, getUserLocaleInfo } from '~utils/system-prompt-variables'
import { getWebSearchInstructions } from '~services/agent/prompts'

import { SearchResultItem } from '~services/agent/web-search/base';

export type AnwserPayload = {
  text: string;
  thinking?: string;
  searchResults?: SearchResultItem[];
  /**
   * Reference URLs extracted from model-native web tools (e.g. OpenAI Responses url_citation)
   */
  referenceUrls?: { url: string; title?: string }[];
};

export type Event =
  | {
      type: 'UPDATE_ANSWER'
      data: AnwserPayload
    }
  | {
      type: 'DONE'
    }
  | {
      type: 'ERROR'
      error: ChatError
    }
  | {
      type: 'TOOL_CALL'
      data: {
        id: string
        name: string
        arguments: any
      }
    }

export interface MessageParams {
  prompt: string
  rawUserInput?: string
  images?: File[]
  audioFiles?: File[]
  videoFiles?: File[]
  pdfFiles?: File[]
  signal?: AbortSignal
}

export interface SendMessageParams extends MessageParams {
  onEvent: (event: Event) => void
  webAccessEnabled?: boolean
}

export interface ConversationHistory {
  messages: any[];  // 各ボットの実装に合わせて型を定義
}

/** Temporary per-session overrides for the quick settings balloon */
export interface TempChatOverrides {
  temperature?: number;
  thinkingBudget?: number;
  thinkingLevel?: 'low' | 'high';
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  geminiImageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
  /** Dynamic image tool parameters from tool definition schema */
  imageToolParams?: Record<string, any>;
}

export abstract class AbstractBot {
  // 思考パーサーインスタンス
  private thinkingParser = new ThinkingParser();

  get supportsPdfInput(): boolean { return false }

  public sendMessage(params: MessageParams): AsyncGenerator<AnwserPayload> {
    return this.doSendMessageGenerator(params);
  }

  // 会話履歴を設定するメソッド (空の実装 - 各ボット固有の実装に任せる)
  public setConversationHistory(_history: ConversationHistory): void {
    // デフォルトでは何もしない - 各ボット実装でオーバーライド
  }

  // 会話履歴を取得するメソッド (空の実装 - 各ボット固有の実装に任せる)
  public getConversationHistory(): ConversationHistory | undefined {
    // デフォルトでは何も返さない - 各ボット実装でオーバーライド
    return undefined;
  }

  /**
   * テキストから思考内容を抽出する処理
   * @param data 元のデータ
   * @returns 処理後のデータ
   */
  private _processThinkingContent(data: AnwserPayload): AnwserPayload {
    // テキストがない場合はそのまま返す
    if (!data.text) {
      return data;
    }
    
    // テキストから思考内容を抽出
    const processed = this.thinkingParser.processFragment(data.text);
    
    // 処理結果を返す（新しい思考内容があれば反映）
    return {
      text: processed.text,
      thinking: processed.thinking || data.thinking
    };
  }

  // 前回のストリーミングチャンクで送信した思考内容を保持
  private previousThinking: string = ''

  /**
   * Web search instructions をsystem promptに動的追加
   */
  protected enhanceSystemPromptWithWebSearch(systemPrompt: string, webAccessEnabled: boolean, language: string = 'en'): string {
    const webSearchInstructions = getWebSearchInstructions(webAccessEnabled, language)
    return systemPrompt + webSearchInstructions
  };

  /**
   * 各ボットの実装から使用するためのイベント発行ヘルパーメソッド
   * テキストから思考タグを抽出し、差分のみを送信する
   * @param params SendMessageParamsオブジェクト
   * @param data イベントデータ (テキストのみ、またはテキストと思考内容)
   */
  protected emitUpdateAnswer(params: SendMessageParams, data: AnwserPayload | string): void {
    // 文字列が渡された場合、AnwserPayloadに変換
    const payload: AnwserPayload = typeof data === 'string' ? { text: data } : data;
    
    // テキスト処理と思考抽出
    const processedData = this._processThinkingContent(payload);
    
    // 思考内容の差分処理
    if (processedData.thinking) {
      // 現在の思考内容と前回の思考内容の差分を計算
      const currentThinking = processedData.thinking;
      let thinkingDiff = '';
      
      if (this.previousThinking && currentThinking.startsWith(this.previousThinking)) {
        // 前回の内容から新しく追加された部分のみを取得
        thinkingDiff = currentThinking.substring(this.previousThinking.length);
      } else {
        // 前回の思考内容がないか、内容が変わった場合は全体を使用
        thinkingDiff = currentThinking;
      }
      
      // 前回の思考内容を更新
      this.previousThinking = currentThinking;
      
      // 差分のみを送信
      params.onEvent({
        type: 'UPDATE_ANSWER',
        data: {
          text: processedData.text,
          thinking: thinkingDiff
        }
      });
    } else {
      // 思考内容がない場合はそのまま送信
      params.onEvent({
        type: 'UPDATE_ANSWER',
        data: processedData
      });
    }
  }

  protected async *doSendMessageGenerator(params: MessageParams) {
    const wrapError = (err: unknown) => {
      Sentry.captureException(err)
      if (err instanceof ChatError) {
        return err
      }
      if (!params.signal?.aborted) {
        // ignore user abort exception
        return new ChatError((err as Error).message, ErrorCode.UNKOWN_ERROR)
      }
    }
    const stream = new ReadableStream<AnwserPayload>({
      start: (controller) => {
        this.doSendMessage({
          prompt: params.prompt,
          rawUserInput: params.rawUserInput,
          images: params.images,
          audioFiles: params.audioFiles,
          videoFiles: params.videoFiles,
          pdfFiles: params.pdfFiles,
          signal: params.signal,
          onEvent(event) {
            if (event.type === 'UPDATE_ANSWER') {
              controller.enqueue(event.data)
            } else if (event.type === 'DONE') {
              controller.close()
            } else if (event.type === 'ERROR') {
              const error = wrapError(event.error)
              if (error) {
                controller.error(error)
              }
            }
          },
        }).catch((err) => {
          const error = wrapError(err)
          if (error) {
            controller.error(error)
          }
        })
      },
    })
    yield* streamAsyncIterable(stream)
  }

  get name(): string | undefined {
    return undefined
  }

  get chatBotName(): string | undefined {
    return this.name
  }

  get avatar(): string | undefined {
    return undefined
  }

  get modelName(): string | undefined {
    return undefined
  }

  get supportsImageInput() {
    return false
  }

  get supportsAudioInput() {
    return false
  }

  get supportsVideoInput() {
    return false
  }

  abstract doSendMessage(params: SendMessageParams): Promise<void>
  abstract resetConversation(): void
  
  // Optional system message setter - implement if supported
  setSystemMessage?(systemMessage: string): void

  // すべてのモデルの実装が終わるまでとりあえず何もしない関数
  async modifyLastMessage(_message: string): Promise<void> {
    // デフォルトでは何もしない
    return
  }

  /**
   * Process system message by replacing template variables
   * @param systemMessage - Raw system message with template variables
   * @returns System message with variables replaced
   */
  protected processSystemMessage(systemMessage: string): string {
    const { current_date, current_time } = getCurrentDateTime()
    const { language, timezone } = getUserLocaleInfo()
    
    return replaceSystemPromptVariables(systemMessage, {
      current_date,
      current_time,
      modelname: this.modelName || 'Unknown',
      chatbotname: this.chatBotName || 'Assistant', 
      language,
      timezone,
    })
  }

}

class DummyBot extends AbstractBot {
  async doSendMessage(_params: SendMessageParams) {
    // dummy
  }
  resetConversation() {
    // dummy
  }
  get name() {
    return ''
  }

  async modifyLastMessage(_message: string) {
    // dummy
  }
}

export abstract class AsyncAbstractBot extends AbstractBot {
  #bot: AbstractBot
  #initializeError?: Error
  #isInitialized: boolean = false

  constructor() {
    super()
    this.#bot = new DummyBot()
    this.initializeBot()
      .then((bot) => {
        this.#bot = bot
        this.#isInitialized = true
        // 親クラスの会話履歴があれば、初期化されたボットに設定
        const history = this.getConversationHistory()
          if (history) {
            this.#bot.setConversationHistory(history)
        }
      })
      .catch((err) => {
        this.#initializeError = err
      })
  }

  get isInitialized(): boolean {
    return this.#isInitialized
  }

  abstract initializeBot(): Promise<AbstractBot>

  async doSendMessage(params: SendMessageParams): Promise<void> {
    // Wait for initialization to complete
    while (this.#bot instanceof DummyBot && !this.#initializeError) {
      console.log('[AsyncAbstractBot] Waiting for bot initialization...')
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (this.#bot instanceof DummyBot && this.#initializeError) {
      throw this.#initializeError;
    }
    return this.#bot.doSendMessage(params);
  }

  resetConversation() {
    return this.#bot.resetConversation()
  }

  modifyLastMessage(message: string) {
    if (this.#bot instanceof DummyBot && this.#initializeError) {
      throw this.#initializeError
    }
    return this.#bot.modifyLastMessage(message)
  }

  // 会話履歴の設定をオーバーライド
  setConversationHistory(history: ConversationHistory): void {
    super.setConversationHistory(history)
    // 内部ボットにも会話履歴を設定
    if (!(this.#bot instanceof DummyBot)) {
      this.#bot.setConversationHistory(history)
    }
  }

  // 会話履歴の取得をオーバーライド
  getConversationHistory(): ConversationHistory | undefined {
    // 内部ボットから会話履歴を取得
    if (!(this.#bot instanceof DummyBot)) {
      return this.#bot.getConversationHistory()
    }
    return super.getConversationHistory()
  }

  get modelName() {
    return this.#bot.modelName
  }

  get name() {
    return this.#bot.name
  }

  get supportsImageInput() {
    return this.#bot.supportsImageInput
  }

  get supportsAudioInput() {
    return this.#bot.supportsAudioInput
  }

  get supportsVideoInput() {
    return this.#bot.supportsVideoInput
  }

  get supportsPdfInput() {
    return this.#bot.supportsPdfInput
  }

  // System message setter for dynamic updates
  async setSystemMessage(systemMessage: string) {
    // Wait for initialization to complete
    while (this.#bot instanceof DummyBot && !this.#initializeError) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (!(this.#bot instanceof DummyBot) && this.#bot.setSystemMessage) {
      this.#bot.setSystemMessage(systemMessage);
    }
  }

  /**
   * Optional hook to propagate Web Access toggle to the underlying bot
   * (e.g., GeminiApiBot can implement setWebAccessEnabled).
   */
  async setWebAccessEnabled(enabled: boolean) {
    // Wait for initialization to complete
    while (this.#bot instanceof DummyBot && !this.#initializeError) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (!(this.#bot instanceof DummyBot) && typeof (this.#bot as any).setWebAccessEnabled === 'function') {
      (this.#bot as any).setWebAccessEnabled(enabled);
    }
  }

  getSystemMessage() {
    if (!(this.#bot instanceof DummyBot) && typeof (this.#bot as any).getSystemMessage === 'function') {
      return (this.#bot as any).getSystemMessage()
    }
    return undefined
  }

  async setTools(tools: any[]) {
    // Wait for initialization to complete
    while (this.#bot instanceof DummyBot && !this.#initializeError) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (!(this.#bot instanceof DummyBot) && typeof (this.#bot as any).setTools === 'function') {
      (this.#bot as any).setTools(tools)
    }
  }

  async setTemporaryOverrides(overrides: TempChatOverrides) {
    // Wait for initialization to complete
    while (this.#bot instanceof DummyBot && !this.#initializeError) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (!(this.#bot instanceof DummyBot) && typeof (this.#bot as any).setTemporaryOverrides === 'function') {
      (this.#bot as any).setTemporaryOverrides(overrides)
    }
  }
}
