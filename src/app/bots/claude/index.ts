import { ClaudeMode, getUserConfig } from '~/services/user-config'
import * as agent from '~services/agent'
import { AsyncAbstractBot, MessageParams } from '../abstract-bot'
import { ClaudeApiBot } from '../claude-api'
import { ClaudeWebBot } from '../claude-web'
import { PoeWebBot } from '../poe'
import { ChatError, ErrorCode } from '~utils/errors'
import { OpenRouterBot } from '../openrouter'

export class ClaudeBot extends AsyncAbstractBot {
  private claudeNumber: number; // ChatGPT Numberを格納するフィールド
  constructor(params: {
    claudeNumber: number; // ChatGPT Numberをオプション引数として追加
  }) {
    super(); // 親クラスのコンストラクタを呼び出す
    this.claudeNumber = params.claudeNumber ?? 0; // 値が未定義の場合は0を使用
  }

  async initializeBot() {
    const { claudeMode, ...config } = await getUserConfig()
    if (claudeMode === ClaudeMode.API) {
      if (!config.claudeApiKey) {
        throw new Error('Claude API key missing')
      }

      if (this.claudeNumber > 0) {
        return new ClaudeApiBot({
          claudeApiKey: config.customApiKey,
          claudeApiHost: config.customApiConfigs[this.claudeNumber - 1].host ?? config.customApiHost,
          claudeApiModel: config.customApiConfigs[this.claudeNumber - 1].model,
          claudeApiTemperature: config.customApiConfigs[this.claudeNumber - 1].temperature,
          claudeApiSystemMessage: config.customApiConfigs[this.claudeNumber - 1].systemMessage,
        })
      }

      return new ClaudeApiBot({
        claudeApiKey: config.claudeApiKey,
        claudeApiHost: config.claudeApiHost,
        claudeApiModel: config.claudeApiModel,
        claudeApiSystemMessage: config.claudeApiSystemMessage,
        claudeApiTemperature: config.claudeApiTemperature,
      })
    }
    if (claudeMode === ClaudeMode.Webapp) {
      return new ClaudeWebBot()
    }
    if (claudeMode === ClaudeMode.OpenRouter) {
      if (!config.openrouterApiKey) {
        throw new ChatError('OpenRouter API key not set', ErrorCode.API_KEY_NOT_SET)
      }
      const model = `anthropic/${config.openrouterClaudeModel}`
      return new OpenRouterBot({ apiKey: config.openrouterApiKey, model })
    }
    return new PoeWebBot(config.poeModel)
  }

  async sendMessage(params: MessageParams) {
    const { claudeWebAccess } = await getUserConfig()
    if (claudeWebAccess) {
      return agent.execute(params.prompt, (prompt) => this.doSendMessageGenerator({ ...params, prompt }), params.signal)
    }
    return this.doSendMessageGenerator(params)
  }
}
