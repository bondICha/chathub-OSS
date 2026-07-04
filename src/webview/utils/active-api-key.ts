import { CustomApiConfig } from '~services/user-config/types/chatbot'
import { ProviderConfig } from '~services/user-config/types/provider'

export type ActiveKeySource = 'provider' | 'individual' | 'common' | 'none'

export interface ActiveKeyInfo {
  source: ActiveKeySource
  key: string
  providerName?: string
  providerId?: string
}

export function resolveActiveKey(
  config: Pick<CustomApiConfig, 'apiKey' | 'providerRefId'>,
  providerRef: ProviderConfig | undefined,
  customApiKey: string,
): ActiveKeyInfo {
  if (providerRef && providerRef.apiKey && providerRef.apiKey.trim().length > 0) {
    return {
      source: 'provider',
      key: providerRef.apiKey,
      providerName: providerRef.name,
      providerId: providerRef.id,
    }
  }

  if (config.apiKey && config.apiKey.trim().length > 0) {
    return { source: 'individual', key: config.apiKey }
  }

  if (customApiKey && customApiKey.trim().length > 0) {
    return { source: 'common', key: customApiKey }
  }

  return { source: 'none', key: '' }
}

export function resolveActiveKeyForProvider(
  provider: Pick<ProviderConfig, 'apiKey'>,
  customApiKey: string,
): ActiveKeyInfo {
  if (provider.apiKey && provider.apiKey.trim().length > 0) {
    return { source: 'individual', key: provider.apiKey }
  }
  if (customApiKey && customApiKey.trim().length > 0) {
    return { source: 'common', key: customApiKey }
  }
  return { source: 'none', key: '' }
}

export function maskKey(key: string, visibleChars = 8): string {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= visibleChars) return `${trimmed}•••`
  return `${trimmed.slice(0, visibleChars)}•••`
}
