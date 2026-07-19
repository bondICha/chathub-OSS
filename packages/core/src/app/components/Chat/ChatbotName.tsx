import { FC, memo, useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiInfo } from 'react-icons/fi'
import dropdownIcon from '~/assets/icons/dropdown.svg'
import { getApiSchemeOptions } from '~app/components/Settings/api-scheme-options'
import { CustomApiProvider, ProviderConfig } from '~services/user-config'
import SwitchBotDropdown from '../SwitchBotDropdown'
import Tooltip from '../Tooltip'

interface Props {
  index: number
  name: string
  model: string | undefined
  fullName?: string
  onSwitchBot?: (index: number) => void
  botConfig?: any
  providerConfigs?: ProviderConfig[]
}

const ChatbotName: FC<Props> = (props) => {
  const { t } = useTranslation()

  // Image Agent info popover state
  const isImageAgent = !!props.botConfig?.agenticImageBotSettings?.imageGeneratorProviderId
  const [showImageAgentNote, setShowImageAgentNote] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showImageAgentNote) return
    const handleClickOutside = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowImageAgentNote(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowImageAgentNote(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showImageAgentNote])

  const schemeLookup = useMemo(() => {
    const map = new Map<CustomApiProvider, string>()
    getApiSchemeOptions().forEach((opt) => {
      map.set(opt.value, opt.name)
    })
    return map
  }, [])

  const resolveProviderDisplay = () => {
    const config = props.botConfig
    if (!config) {
      return null
    }

    const providerRef = config.providerRefId
      ? (props.providerConfigs || []).find((provider) => provider.id === config.providerRefId)
      : undefined

    if (config.providerRefId && !providerRef) {
      return {
        error: t('Provider reference missing (id: {{id}})', { id: config.providerRefId }),
      }
    }

    const effectiveProvider = providerRef?.provider
      ?? (config.provider || (config.model?.includes('anthropic.claude') ? CustomApiProvider.Bedrock : CustomApiProvider.OpenAI))

    const apiFormat = schemeLookup.get(effectiveProvider) || effectiveProvider
    const providerName = providerRef?.name || t('Individual Settings')

    return {
      providerName,
      apiFormat,
    }
  }

  // 詳細情報を含むツールチップコンテンツを文字列で作成
  const createDetailedTooltip = () => {
    if (!props.botConfig) {
      return props.fullName || props.name
    }

    const config = props.botConfig
    const resolvedProviderDisplay = resolveProviderDisplay()
    const details = []
    
    // ヘッダー
    details.push(`━━━ ${props.fullName || props.name} ━━━`)
    
    // 基本情報
    if (config.model) details.push(`🤖 Model: ${config.model}`)
    if (config.host) details.push(`🌐 Host: ${config.host}`)
    if (resolvedProviderDisplay?.providerName) details.push(`⚡ Provider: ${resolvedProviderDisplay.providerName}`)
    if (resolvedProviderDisplay?.apiFormat) details.push(`🧩 API Scheme: ${resolvedProviderDisplay.apiFormat}`)
    if (resolvedProviderDisplay?.error) details.push(`⚠ Provider: ${resolvedProviderDisplay.error}`)
    
    details.push('') // 空行
    
    // 設定情報
    details.push('⚙️  Configuration:')
    
    if (config.temperature !== undefined) {
      details.push(`   🌡️ Temperature: ${config.temperature}`)
    }
    
    if (config.thinkingMode !== undefined) {
      details.push(`   🤔 Thinking Mode: ${config.thinkingMode ? 'Enabled' : 'Disabled'}`)
    }
    
    if (config.thinkingBudget !== undefined && config.thinkingMode) {
      details.push(`   📈 Thinking Budget: ${config.thinkingBudget}`)
    }
    else if (config.reasoningEffort && config.reasoningMode) {
      details.push(`   📈 Reasoning Effort: ${config.reasoningEffort}`)
    }
    
    
    
    return details.join('\n')
  }

  const tooltipContent = createDetailedTooltip()

  const node = (
    <Tooltip content={tooltipContent}>
      <span className="font-semibold text-primary-text text-sm cursor-pointer truncate flex-shrink-[1] min-w-0">{props.name}</span>
    </Tooltip>
  )

  const modelNode = props.model ? (
    <Tooltip content={tooltipContent}>
      <div className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs rounded-full px-2 py-1 flex-shrink-[3] min-w-[60px]">
        <div className="truncate">
        {props.model}
      </div>
      </div>
    </Tooltip>
  ) : null;

  // Info icon + popover for Image Agent
  const imageAgentInfoNode = isImageAgent ? (
    <div className="relative flex-shrink-0" ref={infoRef}>
      <button
        type="button"
        className="flex items-center justify-center w-4 h-4 text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          setShowImageAgentNote((v) => !v)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={t('image_agent_history_note')}
      >
        <FiInfo size={14} />
      </button>
      {showImageAgentNote && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-primary-background border border-primary-border rounded-lg shadow-lg p-3 text-xs text-primary-text leading-relaxed">
          {t('image_agent_history_note')}
        </div>
      )}
    </div>
  ) : null

  if (!props.onSwitchBot) {
    return (
      <div className="flex items-center min-w-0 flex-1">
        {node}
        <div className="flex-shrink-[5] min-w-0 w-2"></div>
        {modelNode}
        {imageAgentInfoNode && <div className="flex-shrink-0 w-1.5"></div>}
        {imageAgentInfoNode}
        <div className="flex-shrink-[5] min-w-0 w-2"></div>
      </div>
    )
  }
  const triggerNode = (
    <div className="flex flex-row items-center min-w-0 w-full">
      {node}
      <div className="flex-shrink-[5] min-w-0 w-2"></div>
      {modelNode}
      {imageAgentInfoNode && <div className="flex-shrink-0 w-1.5"></div>}
      {imageAgentInfoNode}
      <div className="flex-shrink-[5] min-w-0 w-2"></div>
      <img src={dropdownIcon} className="w-5 h-5 flex-shrink-0" />
    </div>
  )
  return <SwitchBotDropdown
    selectedIndex={props.index}
    onChange={(index) => props.onSwitchBot?.(index)}
    triggerNode={triggerNode}
  />
}

export default memo(ChatbotName)
