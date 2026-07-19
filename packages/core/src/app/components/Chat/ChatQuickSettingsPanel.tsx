import { FC, useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomApiProvider } from '~services/user-config'
import { TempChatOverrides } from '~app/bots/abstract-bot'
import { getDefaultImageModel } from '~services/image-tool-definitions'
import type { CustomApiConfig } from '~services/user-config'
import type { ProviderConfig } from '~services/user-config/types/provider'

const GEMINI_IMAGE_ASPECT_RATIOS = [
  '1:1', '16:9', '9:16', '3:4', '4:3', '3:2', '2:3',
  '4:5', '5:4', '21:9', '1:4', '4:1', '1:8', '8:1',
]

const GEMINI_IMAGE_SIZES = ['0.5K', '1K', '2K', '4K']

interface Props {
  botConfig: CustomApiConfig | null
  providerConfigs: ProviderConfig[]
  currentOverrides: TempChatOverrides
  onClose: () => void
  onOverridesChange: (overrides: TempChatOverrides) => void
}

const ChatQuickSettingsPanel: FC<Props> = ({ botConfig, providerConfigs, currentOverrides, onClose, onOverridesChange }) => {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  // Resolve effective provider
  const effectiveProvider = (() => {
    if (!botConfig) return undefined
    if (botConfig.providerRefId) {
      const ref = providerConfigs.find(p => p.id === botConfig.providerRefId)
      return ref?.provider ?? botConfig.provider
    }
    return botConfig.provider
  })()

  const isGemini = effectiveProvider === CustomApiProvider.Google || effectiveProvider === CustomApiProvider.VertexAI_Gemini
  const isAnthropic = effectiveProvider === CustomApiProvider.Anthropic || effectiveProvider === CustomApiProvider.VertexAI_Claude
  const isOpenAI = effectiveProvider === CustomApiProvider.OpenAI
  const isOpenRouter = effectiveProvider === CustomApiProvider.OpenRouter
  const isOpenAIResponses = effectiveProvider === CustomApiProvider.OpenAI_Responses

  const thinkingMode = botConfig?.thinkingMode ?? false
  const modelName = botConfig?.model ?? ''
  const isGeminiImageModel = isGemini && modelName.toLowerCase().includes('image')
  const isGemini3Image = isGeminiImageModel && modelName.includes('gemini-3')

  // Detect Image Agent and extract tool schema properties
  const isImageAgent = botConfig?.agenticImageBotSettings?.imageGeneratorProviderId != null

  // Extract settable properties from image tool definition (enum + boolean)
  const imageToolSettableProperties = useMemo(() => {
    if (!isImageAgent || !modelName) return []
    try {
      const agenticSettings = botConfig?.agenticImageBotSettings
      const imageProviderRef = agenticSettings?.imageGeneratorProviderId
        ? (providerConfigs.find(p => p.id === agenticSettings.imageGeneratorProviderId))
        : undefined
      const imageProvider = imageProviderRef?.provider
      const imageModelConfig = getDefaultImageModel(modelName, imageProvider)

      // Use custom tool definition if provided
      const toolDefinition = botConfig?.toolDefinition || imageModelConfig.toolDefinition
      const properties = toolDefinition?.input_schema?.properties || {}

      // Extract properties with enum or boolean type (excluding prompt)
      return Object.entries(properties)
        .filter(([key, prop]: [string, any]) => {
          if (key === 'prompt' || !prop) return false
          if (Array.isArray(prop.enum) && prop.enum.length > 0) return true
          if (prop.type === 'boolean') return true
          return false
        })
        .map(([key, prop]: [string, any]) => ({
          key,
          type: prop.type as string,
          enum: prop.type === 'boolean' ? ['true', 'false'] : (prop.enum as string[]),
          default: prop.type === 'boolean' ? String(prop.default ?? false) : (prop.default as string | undefined),
          description: prop.description as string | undefined,
        }))
    } catch {
      return []
    }
  }, [isImageAgent, modelName, botConfig, providerConfigs])

  const showThinkingBudget = thinkingMode && (isGemini && modelName.includes('gemini-2') || isAnthropic)
  const showThinkingLevel = thinkingMode && isGemini && !modelName.includes('gemini-2')
  const showReasoningEffort = thinkingMode && (isOpenAI || isOpenRouter || isOpenAIResponses)
  const showTemperature = !thinkingMode || isGemini3Image

  // Local state: currentOverrides first, then botConfig defaults
  const [temperature, setTemperature] = useState<number>(currentOverrides.temperature ?? botConfig?.temperature ?? 0.7)
  const [thinkingBudget, setThinkingBudget] = useState<number>(currentOverrides.thinkingBudget ?? botConfig?.thinkingBudget ?? 8192)
  const [thinkingLevel, setThinkingLevel] = useState<'low' | 'high'>(currentOverrides.thinkingLevel ?? botConfig?.thinkingLevel ?? 'high')
  const [reasoningEffort, setReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>(
    (currentOverrides.reasoningEffort as any) ?? (botConfig?.reasoningEffort as any) ?? 'medium'
  )
  const [aspectRatio, setAspectRatio] = useState<string>(currentOverrides.geminiImageConfig?.aspectRatio ?? botConfig?.geminiImageConfig?.aspectRatio ?? '')
  const [imageSize, setImageSize] = useState<string>(currentOverrides.geminiImageConfig?.imageSize ?? botConfig?.geminiImageConfig?.imageSize ?? '1K')

  // Dynamic image tool parameters state
  // UNSET_VALUE = let agent decide (do not include in overrides)
  const UNSET_VALUE = '__unset__'
  const [imageToolParams, setImageToolParams] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    const existingParams = currentOverrides.imageToolParams || {}
    imageToolSettableProperties.forEach(prop => {
      initial[prop.key] = existingParams[prop.key] ?? UNSET_VALUE
    })
    return initial
  })

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const buildAndEmitOverrides = (
    temp: number,
    budget: number,
    level: 'low' | 'high',
    effort: 'none' | 'low' | 'medium' | 'high',
    ar: string,
    iSize: string,
    toolParams?: Record<string, string>,
  ) => {
    const overrides: TempChatOverrides = {}
    if (showTemperature) overrides.temperature = temp
    if (showThinkingBudget) overrides.thinkingBudget = budget
    if (showThinkingLevel) overrides.thinkingLevel = level
    if (showReasoningEffort) overrides.reasoningEffort = effort
    if (isGeminiImageModel) {
      overrides.geminiImageConfig = { aspectRatio: ar }
      if (isGemini3Image) overrides.geminiImageConfig.imageSize = iSize
    }
    if (isImageAgent && toolParams) {
      // Only include params that are not __unset__ (agent decides)
      const effective: Record<string, string> = {}
      for (const [k, v] of Object.entries(toolParams)) {
        if (v !== '__unset__') effective[k] = v
      }
      if (Object.keys(effective).length > 0) {
        overrides.imageToolParams = effective
      }
    }
    onOverridesChange(overrides)
  }

  const handleTemperatureChange = (v: number) => {
    setTemperature(v)
    buildAndEmitOverrides(v, thinkingBudget, thinkingLevel, reasoningEffort, aspectRatio, imageSize, imageToolParams)
  }
  const handleThinkingBudgetChange = (v: number) => {
    setThinkingBudget(v)
    buildAndEmitOverrides(temperature, v, thinkingLevel, reasoningEffort, aspectRatio, imageSize, imageToolParams)
  }
  const handleThinkingLevelChange = (v: 'low' | 'high') => {
    setThinkingLevel(v)
    buildAndEmitOverrides(temperature, thinkingBudget, v, reasoningEffort, aspectRatio, imageSize, imageToolParams)
  }
  const handleReasoningEffortChange = (v: 'none' | 'low' | 'medium' | 'high') => {
    setReasoningEffort(v)
    buildAndEmitOverrides(temperature, thinkingBudget, thinkingLevel, v, aspectRatio, imageSize, imageToolParams)
  }
  const handleAspectRatioChange = (v: string) => {
    setAspectRatio(v)
    buildAndEmitOverrides(temperature, thinkingBudget, thinkingLevel, reasoningEffort, v, imageSize, imageToolParams)
  }
  const handleImageSizeChange = (v: string) => {
    setImageSize(v)
    buildAndEmitOverrides(temperature, thinkingBudget, thinkingLevel, reasoningEffort, aspectRatio, v, imageToolParams)
  }
  const handleImageToolParamChange = (key: string, value: string) => {
    const newParams = { ...imageToolParams, [key]: value }
    setImageToolParams(newParams)
    buildAndEmitOverrides(temperature, thinkingBudget, thinkingLevel, reasoningEffort, aspectRatio, imageSize, newParams)
  }

  const labelClass = 'text-xs font-medium opacity-70 mb-1'
  const sectionClass = 'space-y-3'
  const dividerClass = 'border-t border-primary-border my-3'

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 w-64 bg-primary-background border border-primary-border rounded-xl shadow-lg p-4 space-y-3"
    >
      {/* Title */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('Quick Settings')}</span>
        <span className="text-xs opacity-50">{t('Temporary')}</span>
      </div>

      <div className={dividerClass} />

      {/* Temperature */}
      {showTemperature && (
        <div className={sectionClass}>
          <div className={labelClass}>{t('Temperature')}</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
              className="w-full h-2 cursor-pointer"
            />
            <span className="text-xs min-w-[3ch] text-right">{temperature.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Thinking Budget (Gemini 2.5 / Anthropic) */}
      {showThinkingBudget && (
        <div className={sectionClass}>
          <div className={labelClass}>{t('Thinking Budget')}</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={isGemini ? -1 : 2000}
              max={isGemini ? 32768 : 32000}
              step={isGemini ? 512 : 1000}
              value={thinkingBudget}
              onChange={(e) => handleThinkingBudgetChange(parseInt(e.target.value))}
              className="w-full h-2 cursor-pointer"
            />
            <span className="text-xs min-w-[7ch] text-right">
              {thinkingBudget === -1 ? t('Dynamic') : thinkingBudget}
            </span>
          </div>
        </div>
      )}

      {/* Thinking Level (Gemini 3+) */}
      {showThinkingLevel && (
        <div className={sectionClass}>
          <div className={labelClass}>{t('Thinking Level')}</div>
          <div className="flex gap-2">
            {(['low', 'high'] as const).map((v) => (
              <button
                key={v}
                onClick={() => handleThinkingLevelChange(v)}
                className={`flex-1 text-xs py-1 rounded-md border transition-colors ${
                  thinkingLevel === v
                    ? 'border-primary-blue bg-primary-blue text-white'
                    : 'border-primary-border hover:border-primary-blue'
                }`}
              >
                {v === 'low' ? t('Low') : t('High')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning Effort (OpenAI) */}
      {showReasoningEffort && (
        <div className={sectionClass}>
          <div className={labelClass}>{t('Reasoning Effort')}</div>
          <div className="flex gap-1">
            {(['none', 'low', 'medium', 'high'] as const).map((v) => (
              <button
                key={v}
                onClick={() => handleReasoningEffortChange(v)}
                className={`flex-1 text-xs py-1 rounded-md border transition-colors capitalize ${
                  reasoningEffort === v
                    ? 'border-primary-blue bg-primary-blue text-white'
                    : 'border-primary-border hover:border-primary-blue'
                }`}
              >
                {t(v)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gemini Image Config */}
      {isGeminiImageModel && (
        <>
          {(showTemperature || showThinkingBudget || showThinkingLevel || showReasoningEffort) && (
            <div className={dividerClass} />
          )}
          <div className={sectionClass}>
            <div className={labelClass}>{t('Aspect Ratio')}</div>
            <select
              value={aspectRatio}
              onChange={(e) => handleAspectRatioChange(e.target.value)}
              className="w-full text-xs rounded-md border border-primary-border bg-primary-background px-2 py-1 focus:outline-none focus:border-primary-blue"
            >
              <option value="">{t('Default (auto)')}</option>
              {GEMINI_IMAGE_ASPECT_RATIOS.map((ar) => (
                <option key={ar} value={ar}>{ar}</option>
              ))}
            </select>
          </div>
          {isGemini3Image && (
            <div className={sectionClass}>
              <div className={labelClass}>{t('Resolution')}</div>
              <div className="flex gap-1">
                {GEMINI_IMAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleImageSizeChange(s)}
                    className={`flex-1 text-xs py-1 rounded-md border transition-colors ${
                      imageSize === s
                        ? 'border-primary-blue bg-primary-blue text-white'
                        : 'border-primary-border hover:border-primary-blue'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dynamic Image Tool Parameters (Image Agent) */}
      {isImageAgent && imageToolSettableProperties.length > 0 && (
        <>
          {(showTemperature || showThinkingBudget || showThinkingLevel || showReasoningEffort || isGeminiImageModel) && (
            <div className={dividerClass} />
          )}
          {imageToolSettableProperties.map((prop) => (
            <div key={prop.key} className={sectionClass}>
              <div className={labelClass}>{prop.key}</div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => handleImageToolParamChange(prop.key, UNSET_VALUE)}
                  className={`text-xs py-1 px-2 rounded-md border transition-colors italic ${
                    imageToolParams[prop.key] === UNSET_VALUE
                      ? 'border-primary-blue bg-primary-blue text-white'
                      : 'border-primary-border hover:border-primary-blue opacity-60'
                  }`}
                >
                  -
                </button>
                {prop.enum.map((value) => (
                  <button
                    key={value}
                    onClick={() => handleImageToolParamChange(prop.key, value)}
                    className={`text-xs py-1 px-2 rounded-md border transition-colors ${
                      imageToolParams[prop.key] === value
                        ? 'border-primary-blue bg-primary-blue text-white'
                        : 'border-primary-border hover:border-primary-blue'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div className={dividerClass} />
      <p className="text-xs opacity-50 text-center">{t('Quick settings are temporary and reset on reload')}</p>
    </div>
  )
}

export default ChatQuickSettingsPanel
