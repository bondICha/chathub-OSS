import { CustomApiProvider } from '../../src/services/user-config'

/**
 * Provider-specific default configuration
 * Defines default host URLs and path handling for each API provider
 */
export interface ProviderDefaults {
  /** Default API host URL */
  host: string
  /** Whether the host is a full API path (true) or base URL (false) */
  isHostFullPath?: boolean
}

/**
 * Default host configuration for each provider
 * Used when creating new provider configurations
 */
export const PROVIDER_DEFAULTS: Partial<Record<CustomApiProvider, ProviderDefaults>> = {
  [CustomApiProvider.GeminiOpenAI]: {
    host: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    isHostFullPath: true,
  },
  [CustomApiProvider.Google]: {
    host: 'https://generativelanguage.googleapis.com',
    isHostFullPath: false,
  },
  [CustomApiProvider.QwenOpenAI]: {
    host: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    isHostFullPath: false,
  },
  [CustomApiProvider.OpenRouter]: {
    host: 'https://openrouter.ai/api/v1',
    isHostFullPath: false,
  },
  // Image-specific providers
  [CustomApiProvider.NovitaAI]: {
    host: 'https://api.novita.ai',
    isHostFullPath: false,
  },
  [CustomApiProvider.ChutesAI]: {
    host: 'https://image.chutes.ai',
    isHostFullPath: false,
  },
  [CustomApiProvider.Replicate]: {
    host: 'https://api.replicate.com/v1/models/%model/predictions',
    isHostFullPath: true,
  },
}

/**
 * Get host suggestions for autocomplete
 * Combines provider defaults with common host URLs
 */
export function getHostSuggestions(): string[] {
  const providerHosts = Object.values(PROVIDER_DEFAULTS).map(def => def.host)

  const commonHosts = [
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://api.deepseek.com',
    'https://api.x.ai',
    'https://api.deepinfra.com/v1/openai/chat/completions',
    'https://api.fireworks.ai',
    'https://dashscope.aliyuncs.com',
    'https://openrouter.ai/api',
    'https://api.novita.ai/openai',
    'https://api.hyperbolic.xyz',
    'https://api.studio.nebius.com',
    'https://api.z.ai/api/coding/paas/v4/chat/completions',
  ]

  // Combine and deduplicate
  return Array.from(new Set([...providerHosts, ...commonHosts])).sort()
}
