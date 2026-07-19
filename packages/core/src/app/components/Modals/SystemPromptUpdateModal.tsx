import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ExpandableDialog from '../ExpandableDialog'
import Button from '../Button'
import { updateSystemPromptToVersion, markSystemPromptVersionAsRead } from '~services/system-prompt-version'
import { SYSTEM_PROMPT_VERSION, SYSTEM_PROMPTS } from '~app/system-prompts'
import { getUserConfig } from '~services/user-config'
import toast from 'react-hot-toast'

type Lang = 'en' | 'ja' | 'zh-CN' | 'zh-TW'

type DiffLine = { type: 'added' | 'removed' | 'equal'; value: string }

function lineDiff(a: string[], b: string[]): DiffLine[] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'equal', value: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: b[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', value: a[i - 1] })
      i--
    }
  }
  return result
}

interface Props {
  open: boolean
  onClose: () => void
}

const langLabels: Record<Lang, string> = {
  en: 'English',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const SystemPromptUpdateModal: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation()
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [selectedLang, setSelectedLang] = useState<Lang>('ja')

  useEffect(() => {
    if (open) {
      getUserConfig().then((config) => setCurrentPrompt(config.commonSystemMessage)).catch(() => {})
    }
  }, [open])

  const newPrompt = SYSTEM_PROMPTS[selectedLang] ?? ''
  const diff = lineDiff(currentPrompt.split('\n'), newPrompt.split('\n'))
  const hasChanges = diff.some((l) => l.type !== 'equal')

  const handleUpdate = async () => {
    try {
      await updateSystemPromptToVersion(selectedLang)
      toast.success(t('System prompt has been updated'))
      onClose()
    } catch {
      toast.error(t('Failed to update system prompt'))
    }
  }

  const handleSkip = async () => {
    try {
      await markSystemPromptVersionAsRead()
    } catch {}
    onClose()
  }

  return (
    <ExpandableDialog
      title={`${t('System Prompt Updated')} v${SYSTEM_PROMPT_VERSION}`}
      open={open}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-between items-center">
          <Button text={t('Skip')} color="flat" onClick={handleSkip} />
          <Button
            text={`${t('Update to')} ${langLabels[selectedLang]}`}
            color="primary"
            onClick={handleUpdate}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        {/* 説明文 */}
        <div className="space-y-1">
          <p className="text-sm text-primary-text">
            {t('The default system prompt has been updated. Review the changes below and apply if you agree.')}
          </p>
          <p className="text-xs text-red-500 dark:text-red-400">
            {t('If you have made your own customizations, applying will overwrite them. Please review carefully before updating.')}
          </p>
          <p className="text-xs text-primary-text opacity-70">
            {t('You can also apply this update later from the Settings screen.')}
          </p>
        </div>

        {/* 言語タブ */}
        <div className="flex gap-1 border-b border-primary-border">
          {(Object.keys(langLabels) as Lang[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setSelectedLang(lang)}
              className={`px-3 py-1.5 text-xs rounded-t transition-colors ${
                selectedLang === lang
                  ? 'bg-primary-background border border-b-0 border-primary-border font-semibold text-primary-text'
                  : 'opacity-60 hover:opacity-90 text-primary-text'
              }`}
            >
              {langLabels[lang]}
            </button>
          ))}
        </div>

        {/* diff表示 */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-primary-text opacity-70">
            {hasChanges ? t('Diff: Current vs New') : t('No changes from your current prompt')}
          </p>
          <div className="flex-1 overflow-y-auto rounded border border-primary-border custom-scrollbar">
            {hasChanges ? (
              <pre className="text-xs leading-5 whitespace-pre-wrap break-words font-mono p-2">
                {diff.map((line, i) => (
                  <span
                    key={i}
                    className={
                      line.type === 'added'
                        ? 'block bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                        : line.type === 'removed'
                        ? 'block bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 line-through'
                        : 'block text-primary-text opacity-70'
                    }
                  >
                    {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                    {line.value}
                  </span>
                ))}
              </pre>
            ) : (
              <p className="p-4 text-xs text-center text-primary-text opacity-70">
                {t('Your current prompt is identical to this version.')}
              </p>
            )}
          </div>
        </div>
      </div>
    </ExpandableDialog>
  )
}

export default SystemPromptUpdateModal
