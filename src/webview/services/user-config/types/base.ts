
/**
 * Base types and enums for user configuration
 */

// System prompt mode enum
export enum SystemPromptMode {
  COMMON = 'common',     // Common promptをそのまま使う
  APPEND = 'append',     // Common prompt + 個別prompt
  OVERRIDE = 'override'  // 個別promptで上書き
}

// Font type enum
export enum FontType {
  SANS = 'sans',       // Sans-serif (ゴシック体)
  SERIF = 'serif',     // Serif (明朝体)
}

// Custom API Provider enum
export enum CustomApiProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic', // Default, uses x-api-key
  Bedrock = 'bedrock',
  Anthropic_CustomAuth = 'anthropic-customauth', // Uses Authorization header
  Google = 'google', // For Gemini API
  GeminiOpenAI = 'openai-gemini', // For Gemini OpenAI Compatible API
  QwenOpenAI = 'openai-qwen', // For Qwen OpenAI Compatible API
  VertexAI_Claude = 'vertexai-claude', // For Google VertexAI Claude API
  VertexAI_Gemini = 'vertexai-gemini', // For Google VertexAI Gemini
  OpenAI_Image = 'openai-image', // For OpenAI Image Generation (gpt-image-1)
  OpenAI_Responses = 'openai-responses', // For OpenAI Responses API
  OpenRouter = 'openrouter', // Dedicated OpenRouter provider
  ChutesAI = 'chutes-ai', // Chutes AI (Image) - Image Agent only
  NovitaAI = 'novita-ai', // Novita AI (Image) - Image Agent only
  Replicate = 'replicate', // Replicate (Image) - Image Agent only
  ImageAgent = 'image-agent', // Agentic Image wrapper
}

/**
 * OpenAI-compatible providers (use ChatGPTApiBot or OpenAIResponsesBot)
 * These providers support OpenAI Function Calling format
 */
export const OPENAI_COMPATIBLE_PROVIDERS = [
  CustomApiProvider.OpenAI,
  CustomApiProvider.OpenAI_Responses,
  CustomApiProvider.OpenRouter,
  CustomApiProvider.GeminiOpenAI,
  CustomApiProvider.QwenOpenAI,
] as const

/**
 * Claude-compatible providers (use ClaudeApiBot)
 * These providers support Claude Tool Use format
 */
export const CLAUDE_COMPATIBLE_PROVIDERS = [
  CustomApiProvider.Anthropic,
  CustomApiProvider.VertexAI_Claude,
] as const

/**
 * Gemini-compatible providers (use GeminiApiBot with Gemini SDK)
 * These providers support Gemini function calling format
 */
export const GEMINI_COMPATIBLE_PROVIDERS = [
  CustomApiProvider.Google,
  CustomApiProvider.VertexAI_Gemini,
] as const

/**
 * Providers that support Extended Thinking / Thinking Budget feature
 */
export const THINKING_BUDGET_PROVIDERS = [
  CustomApiProvider.Anthropic,
  CustomApiProvider.Bedrock,
  CustomApiProvider.Anthropic_CustomAuth,
  CustomApiProvider.VertexAI_Claude,
  CustomApiProvider.Google,
  CustomApiProvider.VertexAI_Gemini,
  CustomApiProvider.GeminiOpenAI,
  CustomApiProvider.QwenOpenAI,
] as const

/**
 * Image-only providers (used exclusively by Image Agent)
 * These cannot be selected as direct chatbots
 */
export const IMAGE_ONLY_PROVIDERS = [
  CustomApiProvider.ChutesAI,
  CustomApiProvider.NovitaAI,
  CustomApiProvider.Replicate,
] as const

// Preset provider information (default icons)
export const PROVIDER_INFO: Record<string, { icon: string }> = {
  "OpenAI": { icon: "openai" },
  "Anthropic": { icon: "anthropic" },
  "Google": { icon: "gemini" },
  "Grok": { icon: "grok" },
  "Deepseek": { icon: "deepseek" },
  "Perplexity": { icon: "perplexity" },
  "OpenRouter": { icon: "openrouter" },
  "Rakuten": { icon: "rakuten" },
  "Custom": { icon: "openai" },
}

// Model information type
export interface ModelInfo {
  value: string;
  icon?: string; // 個別のアイコン（オプション）
}
