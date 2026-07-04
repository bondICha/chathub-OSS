import { useTranslation } from 'react-i18next'
import { FC, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Button from '~app/components/Button'
import Blockquote from './Blockquote'
import { resetUserConfig, resetFlags } from '~services/user-config'
import toast from 'react-hot-toast'

interface Props {
  onConfigReset: () => void
}

const DangerZone: FC<Props> = ({ onConfigReset }) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showFlagsConfirmDialog, setShowFlagsConfirmDialog] = useState(false)

  const handleResetConfig = async () => {
    try {
      await resetUserConfig()
      toast.success(t('All settings have been reset to default'))
      onConfigReset()
      setShowConfirmDialog(false)
    } catch (error) {
      console.error('Failed to reset config:', error)
      toast.error(t('Failed to reset settings. Please try again.'))
    }
  }

  const handleResetFlags = async () => {
    try {
      await resetFlags()
      toast.success(t('Flags and display settings have been reset'))
      setShowFlagsConfirmDialog(false)
      // Reload after a short delay to apply language/theme changes
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Failed to reset flags:', error)
      toast.error(t('Failed to reset flags. Please try again.'))
    }
  }

  return (
    <div className="border-t border-red-200 dark:border-red-800 pt-4 mt-6">
      <button
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-red-600 dark:text-red-400 hover:opacity-100 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        {t('Danger Zone')}
      </button>

      {isExpanded && (
        <div className="mt-4 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                {t('Reset All Settings')}
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                {t('This action will permanently delete all your custom settings, API configurations, and preferences.')}
              </p>
            </div>

            <Blockquote className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  {t('Before you proceed:')}
                </p>
                <ul className="list-disc list-inside space-y-1 text-yellow-700 dark:text-yellow-300">
                  <li>{t('Consider exporting your current settings as a backup')}</li>
                  <li>{t('You can import the exported settings later if needed')}</li>
                </ul>
              </div>
            </Blockquote>

            <div className="flex gap-3">
              <Button
                color="primary"
                size="small"
                text={t('Reset All Settings')}
                onClick={() => setShowConfirmDialog(true)}
                className="bg-red-600 hover:bg-red-700 text-white"
              />
            </div>
          </div>

          {/* Reset Flags Section */}
          <div className="mt-4 p-4 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                  {t('Reset Flags and Display Settings')}
                </h4>
                <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">
                  {t('Reset startup flags, display preferences, language, and theme. API and chat settings will be preserved.')}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 italic">
                  {t('Includes: launch count, language, theme, font, startup page, company profile status, etc.')}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  color="primary"
                  size="small"
                  text={t('Reset Flags')}
                  onClick={() => setShowFlagsConfirmDialog(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-red-600 dark:text-red-400">
              {t('Confirm Reset')}
            </h3>

            <div className="mb-6 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('Are you sure you want to reset all settings? This action cannot be undone.')}
              </p>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                  {t('Recommendation:')}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  {t('Please export your current settings before resetting to avoid losing your configuration. You can find the export option at the top of the settings page.')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                color="flat"
                size="small"
                text={t('Cancel')}
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2"
              />
              <Button
                color="primary"
                size="small"
                text={t('Confirm Reset')}
                onClick={handleResetConfig}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {showFlagsConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-orange-600 dark:text-orange-400">
              {t('Confirm Reset Flags')}
            </h3>

            <div className="mb-6 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('This will reset startup counters, display preferences, language, and theme settings. Your API keys and chat configurations will not be affected.')}
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  {t('What will be reset:')}
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                  <li>{t('Launch count and first-time flags')}</li>
                  <li>{t('Language and theme preferences')}</li>
                  <li>{t('Font type and startup page')}</li>
                  <li>{t('Company profile status')}</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                color="flat"
                size="small"
                text={t('Cancel')}
                onClick={() => setShowFlagsConfirmDialog(false)}
                className="px-4 py-2"
              />
              <Button
                color="primary"
                size="small"
                text={t('Confirm Reset Flags')}
                onClick={handleResetFlags}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DangerZone