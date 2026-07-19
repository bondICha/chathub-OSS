import { AbstractBot, SendMessageParams, ConversationHistory, Event, TempChatOverrides } from '../abstract-bot'
import { ChatError, ErrorCode } from '~utils/errors'
import { getUserConfig, OPENAI_COMPATIBLE_PROVIDERS, CLAUDE_COMPATIBLE_PROVIDERS, GEMINI_COMPATIBLE_PROVIDERS, CustomApiProvider } from '~services/user-config'
import { getDefaultImageModel, convertClaudeToolToOpenAI, convertClaudeToolToOpenAIResponses, convertClaudeToolToGemini } from '~services/image-tool-definitions'
import { generateImage } from '~services/image-api-client'
import { createBotInstance } from '..'
import { file2base64 } from '~app/utils/file-utils'

/**
 * Agentic Image Bot (Tool-use based)
 *
 * This bot acts as a wrapper that:
 * 1. Takes a Prompt Generator Bot (e.g., Claude, GPT)
 * 2. Adds image generation tool definition to it
 * 3. Passes user images to Prompt Bot (for Edit support or visual understanding)
 * 4. Intercepts tool calls and generates images
 * 5. Returns images to the user
 *
 * ARCHITECTURE:
 * - Tool definitions are model-specific (defined in image-tool-definitions.ts)
 * - Tool call arguments are passed directly to the API (no parameter mapping)
 * - Edit support is determined by the tool definition metadata
 * - For non-Edit models, Claude sees images and describes them in text prompt instead
 */
export class ImageAgentBot extends AbstractBot {
  private conversationContext?: ConversationHistory
  private tempOverrides?: TempChatOverrides

  constructor(private botIndex: number) {
    super()
  }

  get supportsImageInput() {
    return true // Phase A: Supports image input for editing or visual understanding
  }

  public setConversationHistory(history: ConversationHistory): void {
    this.conversationContext = history
  }

  public getConversationHistory(): ConversationHistory | undefined {
    return this.conversationContext
  }

  public setTemporaryOverrides(overrides: TempChatOverrides): void {
    this.tempOverrides = overrides
  }

  resetConversation(): void {
    this.conversationContext = undefined
    this.tempOverrides = undefined
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    try {
      const cfg = await getUserConfig()
      const custom = cfg.customApiConfigs[this.botIndex]
      if (!custom) throw new ChatError('Invalid bot index for ImageAgent', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)

      const settings = custom.agenticImageBotSettings || {}

      // Get Image Provider settings
      const imageProviderRef = settings.imageGeneratorProviderId
        ? (cfg.providerConfigs || []).find(p => p.id === settings.imageGeneratorProviderId)
        : undefined

      if (!imageProviderRef) {
        throw new ChatError('Image Provider not configured for Image Agent', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      const resolvedImageApiKey = (imageProviderRef.apiKey && imageProviderRef.apiKey.trim().length > 0)
        ? imageProviderRef.apiKey
        : (custom.apiKey || cfg.customApiKey || '')
      const imageHost = imageProviderRef.host
      const imageModel = custom.model
      const imageProvider = imageProviderRef.provider

      if (!resolvedImageApiKey) {
        throw new ChatError('Image Provider API key not set', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      if (!imageModel) {
        throw new ChatError('Image model not configured. Please select a model in chatbot settings.', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      // Get image model configuration (must always use default to ensure correct endpoint construction)
      const imageModelConfig = getDefaultImageModel(imageModel, imageProvider)

      // Override tool definition if custom one is provided
      if (custom.toolDefinition) {
        imageModelConfig.toolDefinition = custom.toolDefinition
      }

      const userImages = params.images || []

      // Get Prompt Generator Bot
      const promptGenIndex = settings.promptGeneratorBotIndex
      if (typeof promptGenIndex !== 'number' || promptGenIndex < 0) {
        throw new ChatError('Prompt Generator Bot not configured', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      const promptBot = createBotInstance(promptGenIndex)
      if (!promptBot) {
        throw new ChatError('Failed to create Prompt Generator Bot', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      // Apply Image Agent's webAccess setting to Prompt Generator Bot
      // This ensures the UI toggle on Image Agent is respected
      // Note: Gemini API does not support mixing function calling tools with Google Search
      if (typeof (promptBot as any).setWebAccessEnabled === 'function') {
        await (promptBot as any).setWebAccessEnabled(!!custom.webAccess)
      }

      // Determine Prompt Bot provider
      const promptBotConfig = cfg.customApiConfigs[promptGenIndex]
      const providerRef = promptBotConfig.providerRefId
        ? (cfg.providerConfigs || []).find(p => p.id === promptBotConfig.providerRefId)
        : undefined
      const effectiveProvider = providerRef?.provider ?? promptBotConfig.provider

      // Check if provider is supported (using constants for maintainability)
      const isClaudeProvider = CLAUDE_COMPATIBLE_PROVIDERS.includes(effectiveProvider as any)
      const isOpenAIProvider = OPENAI_COMPATIBLE_PROVIDERS.includes(effectiveProvider as any)
      const isGeminiProvider = GEMINI_COMPATIBLE_PROVIDERS.includes(effectiveProvider as any)

      if (!isClaudeProvider && !isOpenAIProvider && !isGeminiProvider) {
        throw new ChatError('Image Agent currently only supports Claude, OpenAI-compatible, or Gemini-compatible providers as Prompt Generator Bot', ErrorCode.CUSTOMBOT_CONFIGURATION_ERROR)
      }

      // Inject tool definition into the bot (await for initialization to complete)
      // Convert tool format based on provider
      if (typeof (promptBot as any).setTools === 'function') {
        let toolToInject: any
        if (GEMINI_COMPATIBLE_PROVIDERS.includes(promptBotConfig.provider as any)) {
          // Gemini format: { functionDeclarations: [...] }
          toolToInject = convertClaudeToolToGemini(imageModelConfig.toolDefinition)
        } else if (effectiveProvider === CustomApiProvider.OpenAI_Responses) {
          // OpenAI Responses API format (flat): { type: 'function', name, description, parameters }
          toolToInject = convertClaudeToolToOpenAIResponses(imageModelConfig.toolDefinition)
        } else if (isOpenAIProvider) {
          // OpenAI Chat Completions API format (nested): { type: 'function', function: {...} }
          toolToInject = convertClaudeToolToOpenAI(imageModelConfig.toolDefinition)
        } else {
          // Claude format: use as-is
          toolToInject = imageModelConfig.toolDefinition
        }

        await (promptBot as any).setTools([toolToInject])
      }

      // Modify system prompt with tool usage instructions
      const originalSystemMessage = (promptBot as any).getSystemMessage?.() || ''
      let toolInstruction = `\n\nYou have access to an image generation tool called 'generate_image'. When the user asks you to create, generate, make, or show an image, you MUST use this tool. Do not describe or imagine the image in text - actually generate it using the tool.`

      // Add image-specific instructions if user provided images
      if (userImages.length > 0) {
        if (imageModelConfig.apiConfig.supportsEdit) {
          toolInstruction += `\n\nThe user has provided ${userImages.length} image(s). They are automatically passed into the generate_image tool for editing or reference. Describe the desired changes clearly in your prompt and do not add a separate images parameter.`
        } else {
          toolInstruction += `\n\nIMPORTANT: The user has provided ${userImages.length} image(s), but this model (${imageModel}) does NOT support image editing. You CANNOT include images in the tool call parameters. Instead:
1. Carefully examine the provided images
2. Describe key visual elements (objects, colors, composition, style) in your text prompt
3. Use rich textual descriptions to approximate what the user wants`
        }
      }

      if (typeof (promptBot as any).setSystemMessage === 'function') {
        if (!originalSystemMessage.includes('generate_image')) {
          await (promptBot as any).setSystemMessage(originalSystemMessage + toolInstruction)
        }
      }

      // Set conversation history
      if (this.conversationContext) {
        promptBot.setConversationHistory(this.conversationContext)
      }

      let toolCallDetected = false
      let lastTextUpdate = ''
      let lastThinking = '' // Preserve thinking text from Gemini

      const wrappedParams: SendMessageParams = {
        ...params,
        onEvent: async (event: Event) => {
          if (event.type === 'TOOL_CALL') {
            toolCallDetected = true
            const { id, name, arguments: args } = event.data

            if (name !== 'generate_image') {
              params.onEvent({
                type: 'ERROR',
                error: new ChatError(`Unknown tool: ${name}`, ErrorCode.UNKOWN_ERROR),
              })
              return
            }

            try {
              // Use tool call arguments directly (they match the API format)
              const apiBody: any = { ...args }

              // Apply temporary overrides for image tool parameters (from quick settings)
              if (this.tempOverrides?.imageToolParams) {
                const toolProps = imageModelConfig.toolDefinition.input_schema?.properties || {}
                for (const [k, v] of Object.entries(this.tempOverrides.imageToolParams)) {
                  // Convert string "true"/"false" back to boolean when schema expects boolean
                  if (toolProps[k]?.type === 'boolean') {
                    apiBody[k] = v === 'true'
                  } else {
                    apiBody[k] = v
                  }
                }
              }

              // Auto inject user images into the expected field when supported
              if (imageModelConfig.apiConfig.imageInputField) {
                if (userImages.length > 0) {
                  const fieldName = imageModelConfig.apiConfig.imageInputField
                  const inputFormat = imageModelConfig.apiConfig.imageInputFormat || 'base64-string'

                  if (inputFormat === 'openai-image-url') {
                    // OpenAI GPT Image: array of { image_url: "data:..." } objects
                    // Note: OpenAI requires full data URL with header (keepHeader = true)
                    apiBody[fieldName] = await Promise.all(
                      userImages.map(async (img) => ({
                        image_url: await file2base64(img, true)  // keepHeader = true
                      }))
                    )
                  } else if (inputFormat === 'base64-array') {
                    // Seedream: array of base64 strings
                    apiBody[fieldName] = await Promise.all(
                      userImages.map((img) => file2base64(img))
                    )
                  } else {
                    // base64-string: single image as base64 string (Qwen)
                    apiBody[fieldName] = await file2base64(userImages[0])
                  }
                } else {
                  delete apiBody[imageModelConfig.apiConfig.imageInputField]
                }
              } else if ('images' in apiBody) {
                // Ensure we do not send stray images parameter when the tool does not accept it
                delete apiBody.images
              }

              // Add model field for APIs that require it in the body (Chutes, OpenAI Images)
              if (/chutes/i.test(imageHost || '') || /gpt-image/i.test(imageModel || '')) {
                apiBody.model = imageModel
              }

              // Show generation parameters immediately (before image generation)
              // Create a display version with masked image data
              const displayBody = { ...apiBody }
              if (imageModelConfig.apiConfig.imageInputField && userImages.length > 0) {
                const fieldName = imageModelConfig.apiConfig.imageInputField
                const inputFormat = imageModelConfig.apiConfig.imageInputFormat || 'base64-string'
                const fieldValue = displayBody[fieldName]

                if (inputFormat === 'openai-image-url' && Array.isArray(fieldValue)) {
                  // OpenAI format: array of { image_url: "..." }
                  displayBody[fieldName] = fieldValue.map((_: any, index: number) => {
                    const fileName = userImages[index]?.name || `Input Image ${index + 1}`
                    return { image_url: `[${fileName}]` }
                  })
                } else if (inputFormat === 'base64-string' && typeof fieldValue === 'string') {
                  // Single base64 string (Qwen)
                  const fileName = userImages[0]?.name || 'Input Image'
                  displayBody[fieldName] = `[${fileName}]`
                } else if (Array.isArray(fieldValue)) {
                  // Array of base64 strings (Seedream)
                  displayBody[fieldName] = fieldValue.map((_: any, index: number) => {
                    const fileName = userImages[index]?.name || `Input Image ${index + 1}`
                    return `[${fileName}]`
                  })
                }
              }
              const paramsJson = `\`\`\`json\n${JSON.stringify(displayBody, null, 2)}\n\`\`\``
              const generatingText = lastTextUpdate
                ? `${lastTextUpdate}\n\n⏳ Generating image...\n\n${paramsJson}`
                : `⏳ Generating image...\n\n${paramsJson}`

              params.onEvent({
                type: 'UPDATE_ANSWER',
                data: {
                  text: generatingText,
                  thinking: lastThinking || undefined // Preserve thinking from Gemini
                },
              })

              // Determine endpoint based on whether images are present
              const imageField = imageModelConfig.apiConfig.imageInputField
              const imageValue = imageField ? apiBody[imageField] : undefined
              const hasImages = imageValue !== undefined &&
                                (typeof imageValue === 'string' ||
                                 (Array.isArray(imageValue) && imageValue.length > 0))

              // Build endpoint URL based on provider and configuration
              let endpoint: string
              if (typeof imageModelConfig.apiConfig.endpoint === 'function') {
                // Dynamic endpoint selection (e.g., Novita Qwen with different txt2img vs edit endpoints)
                endpoint = imageModelConfig.apiConfig.endpoint(hasImages, imageHost || '')
              } else if (imageModelConfig.apiConfig.endpoint) {
                // Fixed endpoint specified in configuration
                endpoint = imageModelConfig.apiConfig.endpoint
              } else {
                // Use host directly (for providers like Replicate with full path URLs)
                endpoint = imageHost || ''
              }

              // Replace %model placeholder with actual model name (URL-encoded)
              // This supports full path endpoints (e.g., Replicate) where users specify %model in the URL
              if (endpoint.includes('%model')) {
                endpoint = endpoint.replace(/%model/g, encodeURIComponent(imageModel))
              }

              // Generate image using unified API client
              const imageUrl = await generateImage({
                endpoint,
                apiKey: resolvedImageApiKey,
                body: apiBody,
                signal: params.signal,
                isAsync: imageModelConfig.apiConfig.isAsync,
              })

              // Update with image (replace "Generating..." with actual image)
              const markdown = `![Generated Image](${imageUrl})`
              const finalText = lastTextUpdate
                ? `${lastTextUpdate}\n\n${markdown}\n\n${paramsJson}`
                : `${markdown}\n\n${paramsJson}`

              params.onEvent({
                type: 'UPDATE_ANSWER',
                data: {
                  text: finalText,
                  thinking: lastThinking || undefined // Preserve thinking from Gemini
                },
              })

              params.onEvent({ type: 'DONE' })
            } catch (error) {
              params.onEvent({
                type: 'ERROR',
                error: error instanceof ChatError ? error : new ChatError(String(error), ErrorCode.UNKOWN_ERROR),
              })
            }
          } else if (event.type === 'UPDATE_ANSWER') {
            // Store text and thinking updates in case there's content before tool call
            lastTextUpdate = event.data.text || ''
            lastThinking = event.data.thinking || ''
            // Forward text updates
            params.onEvent(event)
          } else if (event.type === 'DONE') {
            // Don't forward DONE from promptBot - we'll send it ourselves after tool call completes
            // (or at the end if no tool call occurred)
            return
          } else {
            // Forward other events (ERROR, etc.)
            params.onEvent(event)
          }
        },
      }

      // Call the prompt bot with user images
      // IMPORTANT: Pass images so Claude can see them (for Edit mode or visual understanding)
      await promptBot.doSendMessage({
        ...wrappedParams,
        images: userImages,  // Pass through user's images
      })

      if (!toolCallDetected) {
        params.onEvent({ type: 'DONE' })
      }

      if (typeof (promptBot as any).getConversationHistory === 'function') {
        const updatedHistory = (promptBot as any).getConversationHistory()
        if (updatedHistory) {
          this.conversationContext = updatedHistory
        }
      }

      // Cleanup: restore original state
      if (typeof (promptBot as any).setSystemMessage === 'function') {
        await (promptBot as any).setSystemMessage(originalSystemMessage)
      }

      if (typeof (promptBot as any).setTools === 'function') {
        await (promptBot as any).setTools([])
      }
    } catch (error) {
      params.onEvent({
        type: 'ERROR',
        error: error instanceof ChatError ? error : new ChatError(String(error), ErrorCode.UNKOWN_ERROR),
      })
    }
  }
}
