import { CustomApiProvider } from '~services/user-config'

export interface ApiModel {
  id: string
  object: string
  created: number
  owned_by: string
}

export interface ModelFetchConfig {
  provider: CustomApiProvider
  apiKey: string
  host: string
  isHostFullPath?: boolean
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const cache = new Map<string, { models: ApiModel[]; timestamp: number }>()

function getCacheKey(config: ModelFetchConfig): string {
  return `${config.provider}-${config.host}-${config.apiKey.substring(0, 10)}`
}

export async function fetchProviderModels(config: ModelFetchConfig): Promise<ApiModel[]> {
  const { provider, apiKey, host, isHostFullPath } = config

  // Check cache first
  const cacheKey = getCacheKey(config)
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.models
  }

  // Smart URL construction for endpoints (Full Path case, fallback for failed attempts)
  const tryModelsUrls = (host: string): string[] => {
    const urls = []
    
    // First try: direct /models
    if (host.endsWith('/models')) {
      urls.push(host)
    } else {
      // Ensure no double slashes when adding /models
      const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host
      urls.push(`${cleanHost}/models`)
      // Also try /v1/models (for cases like rakuten anthropic)
      urls.push(`${cleanHost}/v1/models`)
    }
    
    // Try removing path segments up to 3 levels
    let currentUrl = host.endsWith('/') ? host.slice(0, -1) : host
    for (let i = 0; i < 3; i++) {
      const lastSlash = currentUrl.lastIndexOf('/')
      if (lastSlash > 8) { // Keep protocol part
        currentUrl = currentUrl.substring(0, lastSlash)
        urls.push(`${currentUrl}/models`)
        urls.push(`${currentUrl}/v1/models`)
      }
    }
    
    return [...new Set(urls)] // Remove duplicates
  }

  // Generate headers based on provider
  const getHeaders = (provider: CustomApiProvider, apiKey: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (provider === CustomApiProvider.Anthropic) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      // OpenAI-compatible (OpenAI, QwenOpenAI, Replicate, etc.)
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    return headers
  }
  
  const isProviderSupported = (_provider: CustomApiProvider): boolean => {
    return true // Support all providers for now
  }
  
    if (!isProviderSupported(provider)) {
    throw new Error('Model fetching is only supported for compatible APIs')
  }

  if (!apiKey || !host) {
    throw new Error('API Key and Host are required')
  }

  let response: Response | null = null
  let lastError: Error | null = null
  const headers = getHeaders(provider, apiKey)

  // Special handling for Replicate - model fetching is not supported
  if (provider === CustomApiProvider.Replicate) {
    throw new Error('Model fetching is not supported for Replicate. Please enter model names manually.')
  }

  // Original logic for other providers
  if (isHostFullPath) {
    // For full path, try smart URL detection
    const possibleUrls = tryModelsUrls(host)
    for (const url of possibleUrls) {
      try {
        response = await fetch(url, {
          method: 'GET',
          headers,
        })
        if (response.ok) break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error')
      }
    }
    if (!response || !response.ok) {
      throw lastError || new Error('All model endpoints failed')
    }
  } else {
    // Try standard path construction first
    const api_path = 'v1/models'
    const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host
    let fullUrlStr: string
    if (baseUrl.endsWith('/v1')) {
      fullUrlStr = `${baseUrl.slice(0, -3)}/${api_path}`
    } else {
      fullUrlStr = `${baseUrl}/${api_path}`
    }
    fullUrlStr = fullUrlStr.replace(/([^:]\/)\/+/g, "$1")
    fullUrlStr = fullUrlStr.replace(/\/v1\/v1\//g, "/v1/")

    try {
      response = await fetch(fullUrlStr, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (err) {
      // If standard path fails, try smart URL detection as fallback
      console.log('Standard path failed, trying smart URL detection...')
      const possibleUrls = tryModelsUrls(host)
      for (const url of possibleUrls) {
        try {
          response = await fetch(url, {
            method: 'GET',
            headers,
          })
          if (response.ok) break
        } catch (fallbackErr) {
          lastError = fallbackErr instanceof Error ? fallbackErr : new Error('Unknown error')
        }
      }
      if (!response || !response.ok) {
        throw lastError || err
      }
    }
  }

  const data = await response.json()
  const fetchedModels: ApiModel[] = data.data || []

  // Sort models by id for consistent ordering
  fetchedModels.sort((a, b) => a.id.localeCompare(b.id))

  // Cache the results
  cache.set(cacheKey, {
    models: fetchedModels,
    timestamp: Date.now()
  })

  return fetchedModels
}

// Helper for multiple configs
export async function fetchProviderModelsForConfigs(
  configs: ModelFetchConfig[]
): Promise<{ modelsPerConfig: Record<number, ApiModel[]>; errorsPerConfig: Record<number, string | null> }> {
  const results: { modelsPerConfig: Record<number, ApiModel[]>; errorsPerConfig: Record<number, string | null> } = {
    modelsPerConfig: {},
    errorsPerConfig: {},
  }

  // Define isProviderSupported inside the function
  const isProviderSupported = (_provider: CustomApiProvider): boolean => {
    return true // Support all providers for now
  }

  const fetchPromises = configs.map(async (config, index) => {
    try {
      // Only fetch for supported APIs
      if (!isProviderSupported(config.provider)) {
        results.errorsPerConfig[index] = 'Model fetching is only supported for compatible APIs'
        return
      }

      if (!config.apiKey || !config.host) {
        results.errorsPerConfig[index] = 'API Key and Host are required'
        return
      }

      // Check cache first
      const cacheKey = getCacheKey(config)
      const cached = cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        results.modelsPerConfig[index] = cached.models
        return
      }

      const fetchedModels = await fetchProviderModels(config)
      results.modelsPerConfig[index] = fetchedModels
    } catch (err) {
      console.error(`Failed to fetch models for config ${index}:`, err)
      results.errorsPerConfig[index] = err instanceof Error ? err.message : 'Unknown error occurred'
    }
  })

  await Promise.allSettled(fetchPromises)
  return results
}

