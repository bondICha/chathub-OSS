/**
 * Image generation related type definitions
 */

/**
 * Tool definition for function calling (Claude Tool Use format)
 *
 * Note: When using with OpenAI-compatible providers, this will be automatically
 * converted to OpenAI Function Calling format via convertClaudeToolToOpenAI()
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      default?: any;
      enum?: string[];
      items?: {
        type: string;
        format?: string; // Add format for items like URIs
      };
      minimum?: number; // Add minimum for number/integer types
      maximum?: number; // Add maximum for number/integer types
      maxItems?: number; // Add maxItems for array types
    }>;
    required?: string[];
  };
}

/**
 * Image function tool settings
 * Used by bots that generate images via function calling:
 * - Chat Bots with Image Function (OpenAI_Image, OpenAI_Responses)
 *
 * Provider-specific parameters are stored in the params object.
 * These parameters are passed directly to the image generation function tool.
 */
export interface ImageFunctionToolSettings {
  /** Whether image generation is enabled (for OpenAI_Responses) */
  enabled?: boolean;
  /** Provider-specific parameters for image generation function tool */
  params?: Record<string, any>;
}

/**
 * Agentic image generation settings
 * Used by Image Agent bot (Prompt Generator + Image Provider wrapper)
 *
 * Image Agent wraps a Prompt Generator Bot (e.g., Claude) and injects
 * image generation tools, then intercepts tool calls to generate images
 * using a dedicated Image Provider (Chutes, Novita, etc.)
 */
export interface AgenticImageBotSettings {
  /** Image Provider ID (from providerConfigs) */
  imageGeneratorProviderId?: string;
  /** Prompt Generator Bot index (null = use raw prompt without enhancement) */
  promptGeneratorBotIndex?: number | null;
  /** Negative prompt for image generation */
  negativePrompt?: string;
  /** Default image width */
  defaultWidth?: number;
  /** Default image height */
  defaultHeight?: number;
  /** Guidance scale */
  guidanceScale?: number;
  /** Inference steps */
  inferenceSteps?: number;
  /** Seed value */
  seed?: number;
  /** Auto-enhance prompts */
  autoEnhancePrompts?: boolean;
  /** Include revised prompt in output */
  includeRevisedPrompt?: boolean;
}
