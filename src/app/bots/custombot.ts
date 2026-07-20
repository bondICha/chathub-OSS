 // CustomBot.ts file (you should create this file or add to an existing file where suitable)
import { AsyncAbstractBot, MessageParams, AnwserPayload } from './abstract-bot';
import * as agent from '~services/agent';
import { ChatGPTApiBot } from './chatgpt-api';
import { ClaudeApiBot } from './claude-api';
import { getUserConfig, CustomApiConfig, CustomApiProvider, SystemPromptMode } from '~/services/user-config';
import { ChatError, ErrorCode } from '~utils/errors';
import { BedrockApiBot } from './bedrock-api';
import { GeminiApiBot } from './gemini-api';
import { VertexClaudeBot } from './vertex-claude';
import { VertexGeminiBot } from './vertex-gemini';
// import { OpenAIImageBot } from './openai-image';
import { OpenAIResponsesBot } from './openai-responses';
import { OpenRouterImageBot } from './openrouter-image';
import { ImageAgentBot } from './image-agent';
import { getUserLocaleInfo } from '~utils/system-prompt-variables';

/**
 * Determine whether a provider's web search is enabled
 */
function hasProviderWebSearch(provider?: CustomApiProvider, config?: CustomApiConfig): boolean {
    // Use unified field if available
    if (typeof config?.providerWebSearch === 'boolean') {
        return config.providerWebSearch;
    }

    // Fallback to legacy fields for backward compatibility
    if (typeof config?.webToolSupport === 'boolean') {
        return config.webToolSupport;
    }

    // Provider defaults for legacy support
    switch (provider) {
        case CustomApiProvider.OpenAI_Responses:
            return config?.responsesWebSearch !== false;
        case CustomApiProvider.Anthropic:
        case CustomApiProvider.VertexAI_Claude:
            return !!config?.webAccess;
        case CustomApiProvider.OpenAI_Image:
            return true;
        case CustomApiProvider.Google:
            return true;
        default:
            return false;
    }
}

export class CustomBot extends AsyncAbstractBot {
    private customBotNumber: number;
    private config: CustomApiConfig | undefined;
    private systemMessageOverride?: string;

    constructor(params: { customBotNumber: number; systemMessageOverride?: string }) {
        super();
        this.customBotNumber = params.customBotNumber;
        this.systemMessageOverride = params.systemMessageOverride;
    }

    async initializeBot() {
        return await this.createBotInstance();
    }

    get chatBotName() {
        return this.config?.name
    }

    get modelName() {
        return this.config?.model
    }

    get avatar() {
        return this.config?.avatar
    }

    sendMessage(params: MessageParams): AsyncGenerator<AnwserPayload> {
        // When providerWebSearch is enabled, use provider's native web search
        // When providerWebSearch is disabled but webAccess is enabled, use HuddleLLM's agent.execute()
        if (this.config?.webAccess && !hasProviderWebSearch(this.config?.provider, this.config)) {
            return agent.execute(
                params.prompt,
                (prompt) => this.doSendMessageGenerator({ ...params, prompt }),
                params.signal,
            );
        }
        return this.doSendMessageGenerator(params);
    }



    // System prompt作成の共通ロジック
    private buildSystemPrompt(config: CustomApiConfig, commonSystemMessage: string): string {
        // システムプロンプトがオーバーライドされている場合はそれを使用
        if (this.systemMessageOverride) {
            return this.systemMessageOverride;
        }

        let combinedSystemMessage = '';
        switch (config.systemPromptMode) {
            case SystemPromptMode.APPEND:
                combinedSystemMessage = `${commonSystemMessage}\n${config.systemMessage}`;
                break;
            case SystemPromptMode.OVERRIDE:
                combinedSystemMessage = config.systemMessage;
                break;
            case SystemPromptMode.COMMON:
                combinedSystemMessage = commonSystemMessage;
                break;
            default:
                combinedSystemMessage = config.systemMessage || commonSystemMessage;
                break;
        }

        // Template variables replacement
        let processedSystemMessage = this.processSystemMessage(combinedSystemMessage);
        
        // Prompt for Web Access
        // NOTE:
        // - For providers with providerWebSearch enabled (OpenAI Responses / Claude / Gemini),
        //   we should NOT inject ANY HuddleLLM-specific web search instructions into the system prompt
        //   (including the "web search is OFF" notice).
        //   Web access behavior is controlled entirely by the provider's API tool
        //   (web_search_preview, web_search_20250305, google_search).
        // - When providerWebSearch is disabled, we inject HuddleLLM's own web search instructions
        //   based on config.webAccess.
        const { language } = getUserLocaleInfo();
        if (!hasProviderWebSearch(config.provider, config)) {
            const webAccessForPrompt = !!config.webAccess;
            processedSystemMessage = this.enhanceSystemPromptWithWebSearch(processedSystemMessage, webAccessForPrompt, language);
        }

        return processedSystemMessage;
    }

    // Web Access設定変更時にSystem Promptを動的更新
    async updateSystemPrompt() {
        const { customApiConfigs, commonSystemMessage } = await getUserConfig();
        const config = customApiConfigs[this.customBotNumber - 1];
        if (!config) {
            return;
        }

        this.config = config;

        const processedSystemMessage = this.buildSystemPrompt(config, commonSystemMessage);

        // AsyncAbstractBotのsetSystemMessageを使用
        this.setSystemMessage(processedSystemMessage);

        // Also propagate Web Access toggle to underlying bot if supported (e.g., GeminiApiBot)
        const webAccessForPrompt = !!config.webAccess;
        await this.setWebAccessEnabled(webAccessForPrompt);
    }

    // Settings Assistant 用: 会話履歴を保持したまま systemMessageOverride を最新の設定で更新する
    async updateSystemMessageOverride(override: string) {
        this.systemMessageOverride = override;
        await this.setSystemMessage(override);
    }

    // setConversationHistoryはAsyncAbstractBotが処理する

    private async createBotInstance() {
        const { customApiKey, customApiHost, customApiConfigs, commonSystemMessage, isCustomApiHostFullPath, providerConfigs } = await getUserConfig();
        const config = customApiConfigs[this.customBotNumber - 1];

        if (!config) {
            throw new ChatError(`No configuration found for bot number ${this.customBotNumber}`, ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR);
        }
        this.config = config

        // Resolve effective Provider/API settings based on providerRefId only
        const providerRef = (config.providerRefId)
            ? (providerConfigs || []).find((p) => p.id === config.providerRefId)
            : undefined;

        const effectiveProvider = providerRef?.provider ?? (config.provider || (config.model.includes('anthropic.claude') ? CustomApiProvider.Bedrock : CustomApiProvider.OpenAI));
        // Resolved Provider を config に反映しておく（Web search 判定などで使用）
        this.config.provider = effectiveProvider;

        // Build system prompt AFTER resolving effectiveProvider
        // This ensures hasProviderWebSearch() can correctly check config.provider
        const processedSystemMessage = this.buildSystemPrompt(config, commonSystemMessage);

        const effectiveHost = (providerRef?.host && providerRef.host.trim().length > 0)
            ? providerRef.host
            : (config.host && config.host.trim().length > 0)
                ? config.host
                : customApiHost;

        const effectiveIsHostFullPath = providerRef
            ? (providerRef.isHostFullPath ?? false)
            : (config.host && config.host.trim().length > 0)
                ? (config.isHostFullPath ?? false)
                : isCustomApiHostFullPath;

        const effectiveApiKey = (providerRef?.apiKey && providerRef.apiKey.trim().length > 0)
            ? providerRef.apiKey
            : (config.apiKey || customApiKey);

        const anthHeader = providerRef?.isAnthropicUsingAuthorizationHeader ?? (config.isAnthropicUsingAuthorizationHeader || false);
        const effectiveAdvanced = providerRef?.advancedConfig ?? config.advancedConfig;

        let botInstance;
        switch (effectiveProvider) {
            case CustomApiProvider.Bedrock:
                botInstance = new BedrockApiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    thinkingMode: config.thinkingMode,
                    thinkingBudget: config.thinkingBudget,
                    webAccess: config.webAccess,
                    isHostFullPath: effectiveIsHostFullPath,
                });
                break;
            case CustomApiProvider.Anthropic:
                botInstance = new ClaudeApiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    thinkingBudget: config.thinkingBudget,
                    isHostFullPath: effectiveIsHostFullPath,
                    webAccess: config.webAccess,
                    advancedConfig: effectiveAdvanced,
                    // When providerWebSearch is enabled, attach Claude's native web_search tool definition.
                    // This will make Claude use the server-side web_search_20250305 tool instead of
                    // HuddleLLM's own web agent.
                    tools: (config.providerWebSearch ?? config.webAccess)
                        ? [
                            {
                                type: 'web_search_20250305',
                                name: 'web_search',
                                max_uses: 5,
                            },
                        ]
                        : undefined,
                }, config.thinkingMode, anthHeader);
                break;
            case CustomApiProvider.OpenAI:
                botInstance = new ChatGPTApiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    isHostFullPath: effectiveIsHostFullPath,
                    webAccess: config.webAccess,
                    botIndex: this.customBotNumber - 1, // 0ベースのインデックス
                    thinkingMode: config.thinkingMode,
                    reasoningEffort: config.reasoningEffort,
                    advancedConfig: effectiveAdvanced,
                });
                break;
            case CustomApiProvider.OpenRouter: {
                const isImageModel = !!(config.advancedConfig?.openrouterIsImageModel)
                const hostForOR = effectiveHost || 'https://openrouter.ai/api'
                if (isImageModel) {
                    // Route to OpenRouter image bot (chat/completions with modalities)
                    botInstance = new OpenRouterImageBot({
                        apiKey: effectiveApiKey,
                        host: hostForOR,
                        model: config.model,
                        systemMessage: processedSystemMessage,
                        isHostFullPath: false,
                        // Use explicit AR from AdvancedConfig or default
                        aspectRatio: (config.advancedConfig?.openrouterAspectRatio as any) || 'auto',
                        providerOnly: effectiveAdvanced?.openrouterProviderOnly,
                    })
                } else {
                    // Route chat to OpenAI-compatible ChatGPTApiBot with OpenRouter headers via host
                    botInstance = new ChatGPTApiBot({
                        apiKey: effectiveApiKey,
                        host: hostForOR,
                        model: config.model,
                        temperature: config.temperature,
                        systemMessage: processedSystemMessage,
                        isHostFullPath: false,
                        webAccess: config.webAccess,
                        botIndex: this.customBotNumber - 1,
                        thinkingMode: config.thinkingMode,
                        reasoningEffort: config.reasoningEffort,
                        advancedConfig: effectiveAdvanced,
                        enableAudioInput: true, // OpenRouter supports input_audio format
                        enableVideoInput: true,
                    })
                }
                break;
            }
            case CustomApiProvider.OpenAI_Image: {
                // OpenAI_Image: Chat Bot with image generation via function calling
                const imageTool: any = { type: 'image_generation' }

                // Apply user-defined parameters
                if (config.imageFunctionToolSettings?.params) {
                    Object.assign(imageTool, config.imageFunctionToolSettings.params)
                }

                botInstance = new OpenAIResponsesBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model || 'gpt-5',
                    systemMessage: processedSystemMessage,
                    isHostFullPath: effectiveIsHostFullPath,
                    webAccess: false,
                    thinkingMode: config.thinkingMode,
                    reasoningEffort: config.reasoningEffort,
                    functionTools: [imageTool],
                    extraBody: undefined,
                })
                break;
            }
            // ChutesAI, NovitaAI, and Replicate are now only used via Image Agent (not as direct chatbots)
            case CustomApiProvider.ImageAgent: {
                // Agentic wrapper: delegates to image generation providers
                botInstance = new ImageAgentBot(this.customBotNumber - 1)
                break;
            }
            case CustomApiProvider.Google:
                {
                    const googleAuthMode = (providerRef?.AuthMode || 'header')
                    const hasCustomHost = !!(effectiveHost && effectiveHost.trim().length > 0)

                    const extraHeaders: Record<string, string> = {}
                    if (googleAuthMode === 'header' && effectiveApiKey && effectiveApiKey.trim().length > 0) {
                        // Gateway-style auth: raw key in Authorization header
                        extraHeaders.Authorization = effectiveApiKey
                    }

                    // Resolve Vertex AI mode (Gemini Enterprise Agent Platform): Provider setting takes precedence
                    const vertexMode = providerRef?.VertexMode ?? config.geminiVertexMode ?? false;

                    botInstance = new GeminiApiBot({
                        geminiApiKey: effectiveApiKey,
                        geminiApiModel: config.model,
                        geminiApiSystemMessage: processedSystemMessage,
                        geminiApiTemperature: config.temperature,
                        providerWebSearch: config.providerWebSearch,
                        webAccess: config.webAccess,
                        thinkingMode: config.thinkingMode,
                        thinkingBudget: config.thinkingBudget,
                        thinkingLevel: config.thinkingLevel,
                        geminiImageConfig: config.geminiImageConfig,
                        // For advanced gateway setups, route the SDK to a custom base URL.
                        // When blank, the SDK uses its default official endpoints.
                        baseUrl: hasCustomHost ? effectiveHost : undefined,
                        apiVersion: undefined,
                        extraHeaders,
                        vertexai: vertexMode,
                    });
                }
                break;
            case CustomApiProvider.OpenAI_Responses: {
                const webSearchEnabled = config.providerWebSearch ?? (config.responsesWebSearch ?? false);
                const imageGenEnabled = !!config.imageFunctionToolSettings?.enabled;

                const buildResponsesTools = () => {
                    let userTools: any[] = [];
                    if (config.responsesFunctionTools?.trim()) {
                        try {
                            const parsed = JSON.parse(config.responsesFunctionTools);
                            if (Array.isArray(parsed)) userTools = parsed;
                        } catch { /* ignore invalid JSON */ }
                    }

                    if (!imageGenEnabled) {
                        return userTools.length > 0 ? userTools : undefined;
                    }

                    const imageTool: any = { type: 'image_generation' };
                    if (config.imageFunctionToolSettings?.params) {
                        Object.assign(imageTool, config.imageFunctionToolSettings.params);
                    }

                    const tools: any[] = [imageTool];
                    if (webSearchEnabled) tools.push({ type: 'web_search_preview' });
                    tools.push(...userTools);
                    return tools;
                };

                botInstance = new OpenAIResponsesBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    systemMessage: processedSystemMessage,
                    isHostFullPath: effectiveIsHostFullPath,
                    webAccess: webSearchEnabled,
                    thinkingMode: config.thinkingMode,
                    reasoningEffort: config.reasoningEffort,
                    functionTools: buildResponsesTools(),
                    extraBody: undefined,
                });
                break;
            }
            case CustomApiProvider.GeminiOpenAI:
                botInstance = new ChatGPTApiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    thinkingMode: false, // No compatibility with OpenAI Reasoning
                    webAccess: config.webAccess,
                    isHostFullPath: true, // GeminiOpenAI は常に Full Path
                    extraBody: config.thinkingMode ? {
                        google: {
                            thinking_config: {
                                include_thoughts: true,
                                thinking_budget: config.thinkingBudget || 2000
                            }
                        }
                    } : undefined
                });
                break;
            case CustomApiProvider.QwenOpenAI:
                botInstance = new ChatGPTApiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    thinkingMode: config.thinkingMode,
                    webAccess: config.webAccess,
                    isHostFullPath: effectiveIsHostFullPath,
                    extraBody: config.thinkingMode ? {
                        enable_thinking: true,
                        thinking_budget: config.thinkingBudget || 2000
                    } : undefined
                });
                break;
            case CustomApiProvider.VertexAI_Claude:
                botInstance = new VertexClaudeBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    temperature: config.temperature,
                    systemMessage: processedSystemMessage,
                    thinkingMode: config.thinkingMode, // Now properly supported with correct max_tokens
                    thinkingBudget: config.thinkingBudget,
                    isHostFullPath: effectiveIsHostFullPath,
                    webAccess: config.webAccess,
                    advancedConfig: effectiveAdvanced,
                });
                break;
            case CustomApiProvider.VertexAI_Gemini:
                botInstance = new VertexGeminiBot({
                    apiKey: effectiveApiKey,
                    host: effectiveHost,
                    model: config.model,
                    systemMessage: processedSystemMessage,
                    temperature: config.temperature,
                    thinkingMode: config.thinkingMode,
                    thinkingBudget: config.thinkingBudget,
                    isHostFullPath: true,
                    webAccess: config.webAccess,
                    geminiAuthMode: ((providerRef?.AuthMode || 'header') === 'default') ? 'query' : (config.geminiAuthMode || 'header'),
                });
                break;
            default:
                console.error(`Unsupported provider detected: ${effectiveProvider}`);
                throw new ChatError(`Unsupported provider: ${effectiveProvider}`, ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR);
        }


        // Ensure initial system message is applied on the created bot (for bots that support it)
        if (botInstance && typeof (botInstance as any).setSystemMessage === 'function') {
            (botInstance as any).setSystemMessage(processedSystemMessage);
        }
        return botInstance;
    }
}
