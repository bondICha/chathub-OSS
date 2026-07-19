/**
 * Chatbot configuration types
 */

import { SystemPromptMode, CustomApiProvider } from './base'
import { AdvancedConfig } from './provider'
import { ImageFunctionToolSettings, AgenticImageBotSettings, ToolDefinition } from './image-settings'

/**
 * Custom API configuration interface
 * Holds configuration information for custom API chatbots
 */
export interface CustomApiConfig {
  id?: number; // Unused, kept for backward compatibility
  name: string;
  shortName: string;
  host: string;
  model: string;
  temperature: number;
  systemMessage: string;
  systemPromptMode: SystemPromptMode;
  avatar: string;
  apiKey: string;
  thinkingMode?: boolean; // Thinking mode (or Reasoning)
  thinkingBudget?: number; // Anthropic/Gemini 2.5 thinking budget
  thinkingLevel?: 'low' | 'high'; // Gemini 3+ thinking level
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'; // OpenAI reasoning effort
  provider: CustomApiProvider;
  /**
   * Enable HuddleLLM's agent.execute() for web search when provider web search is disabled
   * Note: When providerWebSearch is true, this field is ignored
   */
  webAccess?: boolean;
  isAnthropicUsingAuthorizationHeader?: boolean;
  /** Gemini auth mode: 'header' | 'query' (for individual settings) */
  geminiAuthMode?: 'header' | 'query';
  /** Gemini Vertex AI mode (required for Rakuten AI Gateway and Vertex AI endpoints) */
  geminiVertexMode?: boolean;
  enabled?: boolean; // Enable/disable state
  isHostFullPath?: boolean; // Whether host is a full path (default: false)
  advancedConfig?: AdvancedConfig;
  /** Provider reference ID */
  providerRefId?: string;

  /** Image function tool settings (for OpenAI_Image) */
  imageFunctionToolSettings?: ImageFunctionToolSettings;

  /** Agentic image generation settings (for ImageAgent) */
  agenticImageBotSettings?: AgenticImageBotSettings;

  /** Gemini native image generation config (for Google provider image models) */
  geminiImageConfig?: {
    /** Aspect ratio of the output image */
    aspectRatio?: string;
    /** Image resolution (only for gemini-3.x image models): "512px" | "1K" | "2K" | "4K" */
    imageSize?: string;
  };

  /**
   * Unified provider Web search toggle
   * When true, use provider's native web search (OpenAI web_search_preview, Claude web_search_20250305, Gemini google_search)
   * When false, no provider web search is used (HuddleLLM's agent.execute() can still be used if webAccess is true)
   * This field replaces webAccess/responsesWebSearch/webToolSupport for provider search control
   */
  providerWebSearch?: boolean;

  /** @deprecated Use providerWebSearch instead */
  webToolSupport?: boolean;

  /** Tool definition for image generation (used with Image Agent) */
  toolDefinition?: ToolDefinition;

  /** @deprecated Will be replaced by toolDefinition */
  imageScheme?: 'sd' | 'novita' | 'openai_responses' | 'openrouter_image' | 'qwen_openai' | 'seedream_openai' | 'custom';

  // OpenAI Responses API specific toggles
  /** @deprecated Use providerWebSearch instead */
  responsesWebSearch?: boolean; // Enable web_search_preview tool
  /** JSON string for Responses API tools (function calling, web_search_preview, etc.) */
  responsesFunctionTools?: string;
}

/**
 * Chat pair configuration
 * Holds saved chat pair information
 */
export interface ChatPair {
  id: string; // Unique ID
  name: string; // Pair name (default: bot names joined by |)
  botIndices: number[]; // Selected bot indices
  createdAt: number; // Creation timestamp
  updatedAt: number; // Update timestamp
}
