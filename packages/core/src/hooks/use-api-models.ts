import { useState, useCallback } from 'react'
import { CustomApiProvider } from '~services/user-config'
import { fetchProviderModels, fetchProviderModelsForConfigs, ApiModel, ModelFetchConfig } from '~utils/model-fetcher'

interface UseApiModelsReturn {
  models: ApiModel[]
  loading: boolean
  error: string | null
  fetchModels: (config: ModelFetchConfig, configIndex?: number) => Promise<void>
  fetchAllModels: (configs: ModelFetchConfig[]) => Promise<void>
  fetchSingleModel: (config: ModelFetchConfig, index: number) => Promise<void>
  clearModels: () => void
  modelsPerConfig: Record<number, ApiModel[]>
  errorsPerConfig: Record<number, string | null>
  isProviderSupported: (provider: CustomApiProvider) => boolean
}

export const useApiModels = (): UseApiModelsReturn => {
  const [models, setModels] = useState<ApiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelsPerConfig, setModelsPerConfig] = useState<Record<number, ApiModel[]>>({})
  const [errorsPerConfig, setErrorsPerConfig] = useState<Record<number, string | null>>({})

  const fetchModels = useCallback(async (config: ModelFetchConfig, configIndex?: number) => {
    setLoading(true)
    setError(null)
    
    try {
      const fetchedModels = await fetchProviderModels(config)
      
      if (configIndex !== undefined) {
        setModelsPerConfig(prev => ({ ...prev, [configIndex]: fetchedModels }))
        setErrorsPerConfig(prev => ({ ...prev, [configIndex]: null }))
      } else {
        setModels(fetchedModels)
      }
      
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      const fullErrorMessage = `Failed to fetch models: ${errorMessage}`
      
      if (configIndex !== undefined) {
        setErrorsPerConfig(prev => ({ ...prev, [configIndex]: errorMessage }))
        setModelsPerConfig(prev => ({ ...prev, [configIndex]: [] }))
      } else {
        setError(fullErrorMessage)
        setModels([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAllModels = useCallback(async (configs: ModelFetchConfig[]) => {
    setLoading(true)
    setErrorsPerConfig({})
    
    try {
      const results = await fetchProviderModelsForConfigs(configs)
      setModelsPerConfig(results.modelsPerConfig)
      setErrorsPerConfig(results.errorsPerConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(`Failed to fetch models: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // 個別のモデル取得用関数
  const fetchSingleModel = useCallback(async (config: ModelFetchConfig, index: number) => {
    setLoading(true)
    setErrorsPerConfig(prev => ({ ...prev, [index]: null }))
    
    try {
      const fetchedModels = await fetchProviderModels(config)
      setModelsPerConfig(prev => ({ ...prev, [index]: fetchedModels }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setErrorsPerConfig(prev => ({ ...prev, [index]: errorMessage }))
    } finally {
      setLoading(false)
    }
  }, [])

  const isProviderSupported = useCallback((provider: CustomApiProvider): boolean => {
    // とりあえず全部試す
    // return provider === CustomApiProvider.OpenAI || 
    //        provider === CustomApiProvider.QwenOpenAI || 
    //        provider === CustomApiProvider.GeminiOpenAI || 
    //        provider === CustomApiProvider.Anthropic
    return true
  }, [])

  const clearModels = useCallback(() => {
    setModels([])
    setModelsPerConfig({})
    setErrorsPerConfig({})
    setError(null)
    setLoading(false)
  }, [])

  return {
    models,
    loading,
    error,
    fetchModels,
    fetchAllModels,
    fetchSingleModel,
    clearModels,
    modelsPerConfig,
    errorsPerConfig,
    isProviderSupported
  }
}