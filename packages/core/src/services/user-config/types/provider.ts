/**
 * API Provider configuration types
 */

import { CustomApiProvider } from './base'

export interface AdvancedConfig {
  openrouterProviderOnly?: string; // Comma-separated list of providers for OpenRouter
  anthropicBetaHeaders?: string; // Semicolon-separated "key:value" pairs for Anthropic beta headers
  // OpenRouter specific
  openrouterIsImageModel?: boolean; // Route via chat/completions with modalities
  openrouterAspectRatio?: string;
}

/**
 * API Provider configuration
 */
export interface ProviderConfig {
  /** ID (UUID format) */
  id: string;
  /** Display name */
  name: string;
  /** Provider scheme */
  provider: CustomApiProvider;
  /** API host */
  host: string;
  /** Whether host is a full path */
  isHostFullPath: boolean;
  /** API key (empty = use common key) */
  apiKey: string;
  /** Icon identifier */
  icon: string;
  /** Anthropic auth header type */
  isAnthropicUsingAuthorizationHeader?: boolean;
  /** Auth mode: 'header' | 'query' (for Gemini API) */
  AuthMode?: 'header' | 'default';
  /** Gemini Vertex AI mode (required for Vertex AI endpoints and gateways) */
  VertexMode?: boolean;
  /** Advanced configuration */
  advancedConfig?: AdvancedConfig;
  /**
   * Output data type: 'text' for chat/completion, 'image' for dedicated image APIs.
   * Note: providers that expose image generation via chat/function-calling stay 'text'.
   */
  outputType?: 'text' | 'image';
}
