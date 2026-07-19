import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RestoreWarning } from '~app/pages/HistoryPage/types'

const RestoreWarningModal: FC<{
  warning: RestoreWarning
  onContinue: (warning: RestoreWarning, selectedBotIndex?: number) => void
  onCopyConversation: (warning: RestoreWarning) => void
  onClose: () => void
  copyLoading?: boolean
}> = ({ warning, onContinue, onCopyConversation, onClose, copyLoading }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [selectedBotIndex, setSelectedBotIndex] = useState<number | null>(
    warning.availableBots[0]?.index ?? null,
  )

  const detailText = [
    `[${t('Bot not configured')}]`,
    t('restore_bot_missing_detail'),
    warning.missingBotNames.map((n, i) => `  - ${n} (Bot #${warning.missingBotIndices[i] + 1})`).join('\n'),
    '',
    warning.type === 'individual_bot_missing'
      ? `Conversation ID: ${(warning.item as { conversationId: string }).conversationId}`
      : `Session ID: ${'sessionUUID' in warning.item ? (warning.item as { sessionUUID: string }).sessionUUID : (warning.item as { sessionId: string }).sessionId}`,
  ].join('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(detailText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-primary-background border border-primary-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-primary-text">{t('Bot not configured')}</h2>

        <p className="text-sm text-primary-text opacity-80">{t('restore_bot_missing_detail')}</p>

        <ul className="text-sm text-red-400 space-y-0.5 pl-1">
          {warning.missingBotNames.map((name, i) => (
            <li key={warning.missingBotIndices[i]}>
              {name} (Bot #{warning.missingBotIndices[i] + 1})
            </li>
          ))}
        </ul>

        <pre className="text-xs bg-secondary rounded-lg p-3 text-primary-text opacity-70 whitespace-pre-wrap break-all overflow-auto max-h-28">
          {detailText}
        </pre>

        <div className="flex flex-row gap-2">
          <button
            className="self-start text-xs px-3 py-1.5 rounded-lg border border-primary-border hover:bg-secondary/50 transition-colors"
            onClick={handleCopy}
          >
            {copied ? t('Copied!') : t('Copy details')}
          </button>
          <button
            className="self-start text-xs px-3 py-1.5 rounded-lg border border-primary-border hover:bg-secondary/50 transition-colors disabled:opacity-50"
            onClick={() => onCopyConversation(warning)}
            disabled={copyLoading}
          >
            {copyLoading ? t('Copying...') : t('Copy conversation as Markdown')}
          </button>
        </div>

        {warning.type === 'individual_bot_missing' && warning.availableBots.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm text-primary-text">{t('Select a different bot')}</label>
            <select
              className="bg-secondary text-primary-text text-sm rounded-lg px-3 py-2 border border-primary-border outline-none"
              value={selectedBotIndex ?? ''}
              onChange={(e) => setSelectedBotIndex(Number(e.target.value))}
            >
              {warning.availableBots.map((b) => (
                <option key={b.index} value={b.index}>
                  {b.name} (Bot #{b.index + 1})
                </option>
              ))}
            </select>
            <button
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={selectedBotIndex === null}
              onClick={() => onContinue(warning, selectedBotIndex ?? undefined)}
            >
              {t('Continue with this bot')}
            </button>
          </div>
        )}

        {warning.type === 'aio_bots_missing' && warning.availableBots.length > 0 && (
          <p className="text-xs text-primary-text opacity-70">{t('restore_aio_partial_warning')}</p>
        )}

        <div className="flex flex-row gap-2 justify-end">
          {warning.type === 'aio_bots_missing' && warning.availableBots.length > 0 && (
            <button
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              onClick={() => onContinue(warning)}
            >
              {t('Continue with valid bots')}
            </button>
          )}
          <button
            className="px-4 py-2 rounded-xl border border-primary-border text-sm font-medium hover:bg-secondary/50 transition-colors"
            onClick={onClose}
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RestoreWarningModal
