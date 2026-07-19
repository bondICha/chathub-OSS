import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getUserConfig, updateUserConfig, CustomApiConfig } from '~services/user-config'
import ExpandableDialog from '../ExpandableDialog'
import Select from '../Select'

const AiTitlePromptModal: FC = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [chatbots, setChatbots] = useState<CustomApiConfig[]>([])
  const [selectedBotIndex, setSelectedBotIndex] = useState<number>(0)

  useEffect(() => {
    const checkIfShouldShow = async () => {
      const config = await getUserConfig()
      // Already configured or dismissed
      if (config.titleGenerationBotIndex !== undefined || config.aiTitlePromptDismissed) {
        return
      }
      const bots = config.customApiConfigs || []
      if (bots.length === 0) return // Botが未設定なら表示しない
      setChatbots(bots)
      setSelectedBotIndex(0)
      setOpen(true)
    }
    checkIfShouldShow()
  }, [])

  const handleApply = () => {
    updateUserConfig({ titleGenerationBotIndex: selectedBotIndex })
    setOpen(false)
  }

  const handleDismiss = () => {
    updateUserConfig({ aiTitlePromptDismissed: true })
    setOpen(false)
  }

  return (
    <ExpandableDialog
      title={t('AI Title Generation')}
      open={open}
      onClose={() => setOpen(false)}
      size="sm"
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-primary-text text-sm">
          {t('AI Title Generation Prompt Description')}
        </p>
        <div className="w-full">
          <Select
            options={chatbots.map((config, index) => ({
              name: config.name,
              value: index.toString(),
            }))}
            value={selectedBotIndex.toString()}
            onChange={(v) => setSelectedBotIndex(parseInt(v, 10))}
          />
        </div>
      </div>
      <div className="border-t border-solid border-primary-border px-5 py-3 flex justify-between">
        <button
          onClick={handleDismiss}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t('Do not show again')}
        </button>
        <button
          className="text-sm bg-primary-blue text-white rounded-full px-6 py-[5px] font-medium"
          onClick={handleApply}
        >
          {t('OK')}
        </button>
      </div>
    </ExpandableDialog>
  )
}

export default AiTitlePromptModal
