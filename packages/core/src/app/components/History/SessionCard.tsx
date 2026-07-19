import { FC, memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { IoCopyOutline } from 'react-icons/io5'
import { Download } from 'lucide-react'
import BotIcon from '~app/components/BotIcon'
import Tooltip from '~app/components/Tooltip'
import { cx } from '~utils'

type SessionListItem =
  | {
      type: 'sessionSnapshot'
      sessionUUID: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      botIndices: number[]
      layout: string
      pairName?: string
      firstMessage?: string
      botResponses?: { botName: string; response: string; botIcon?: string }[]
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }
  | {
      type: 'allInOneLegacy'
      sessionId: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      botIndices: number[]
      layout: string
      pairName?: string
      firstMessage?: string
      botResponses?: { botName: string; response: string; botIcon?: string }[]
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }
  | {
      type: 'single'
      botIndex: number
      conversationId: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      firstMessage?: string
      lastMessage?: string
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }

const omitBase64DataUrl = (value?: string) => {
  if (!value) return ''
  return value.replace(/(data:image\/[a-zA-Z0-9.+-]+;base64,)[A-Za-z0-9+/=_-]+/g, '$1[omitted]')
}

interface SessionCardProps {
  session: SessionListItem
  isSelected: boolean
  onToggleSelect: (sessionKey: string) => void
  onRestore: (session: SessionListItem) => void
  onCopy?: (session: SessionListItem) => void
  onDownloadMd?: (session: SessionListItem) => void
  onDownloadJson?: (session: SessionListItem) => void
  actionLoading?: boolean
}

const actionBtnClass =
  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary/40 border border-primary-border/80 hover:bg-secondary/70 hover:border-primary-border transition-colors disabled:opacity-50'

const SessionCard: FC<SessionCardProps> = memo(
  ({ session: s, isSelected, onToggleSelect, onRestore, onCopy, onDownloadMd, onDownloadJson, actionLoading }) => {
    const { t } = useTranslation()

    const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), [])

    const handleRestoreClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onRestore(s)
      },
      [onRestore, s],
    )

    const handleCopyClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onCopy?.(s)
      },
      [onCopy, s],
    )

    const handleDownloadMdClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onDownloadMd?.(s)
      },
      [onDownloadMd, s],
    )

    const handleDownloadJsonClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onDownloadJson?.(s)
      },
      [onDownloadJson, s],
    )

    const handleToggleSelect = useCallback(() => {
      onToggleSelect(s._sessionKey)
    }, [onToggleSelect, s._sessionKey])

    const displayFirstMessage = omitBase64DataUrl(s.firstMessage)
    const displayLastMessage = s.type === 'single' ? omitBase64DataUrl(s.lastMessage) : ''
    const displayBotResponses: { botName: string; response: string; botIcon?: string }[] | undefined =
      s.type === 'single'
        ? undefined
        : s.botResponses?.map((r) => ({
            ...r,
            response: omitBase64DataUrl(r.response),
          }))

    return (
      <div
        className={cx(
          'border-2 border-primary-border/60 rounded-2xl bg-primary-background/50 hover:bg-secondary/30 hover:border-primary-border transition-all cursor-pointer',
          isSelected && 'bg-secondary/30 border-blue-500/40 shadow-lg max-h-[50vh] overflow-y-auto custom-scrollbar',
        )}
        onClick={handleToggleSelect}
      >
        {/* Header: metadata row */}
        <div className={cx(
          'flex flex-row items-center gap-2 flex-wrap px-5 pt-4 pb-1',
          isSelected && 'sticky top-0 z-10 bg-primary-background/90 backdrop-blur-sm rounded-t-2xl pb-2',
        )}>
          <span className="text-xs text-primary-text opacity-70">
            {dayjs(s.lastUpdated).format('YYYY-MM-DD HH:mm')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-green-500/20 text-green-600 dark:text-green-400 font-semibold">
            {s.messageCount} {t('messages')}
          </span>
          {s.type !== 'single' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
              {t('All-In-One')}
            </span>
          )}
          {/* Bot tags inline */}
          {s.botNames && s.botNames.length > 0 && (
            <>
              <span className="text-xs text-primary-text opacity-40 mx-0.5">|</span>
              {s.botNames.map((name, idx) => (
                <span
                  key={idx}
                  className="text-xs px-1.5 py-0.5 rounded-md bg-secondary/50 text-primary-text opacity-80 flex items-center gap-1"
                >
                  {s.botIcons && s.botIcons[idx] && <BotIcon iconName={s.botIcons[idx]} size={14} />}
                  {name}
                </span>
              ))}
            </>
          )}
          {/* Action buttons - always right-aligned */}
          <div className="ml-auto shrink-0 flex flex-row items-center gap-1.5" onClick={stop}>
            {isSelected && (
              <>
                <Tooltip content={t('Copy as Markdown')}>
                  <button className={actionBtnClass} onClick={handleCopyClick} disabled={actionLoading}>
                    <IoCopyOutline size={14} />
                    <span>{t('Copy')}</span>
                  </button>
                </Tooltip>
                <Tooltip content={t('Download .md')}>
                  <button className={actionBtnClass} onClick={handleDownloadMdClick} disabled={actionLoading}>
                    <Download size={14} />
                    <span>.md</span>
                  </button>
                </Tooltip>
                <Tooltip content={t('Download .json')}>
                  <button className={actionBtnClass} onClick={handleDownloadJsonClick} disabled={actionLoading}>
                    <Download size={14} />
                    <span>.json</span>
                  </button>
                </Tooltip>
              </>
            )}
            <Tooltip content={t('Restore Session')}>
              <button
                className={cx(
                  'rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all font-medium px-3 py-1.5 text-xs',
                  isSelected && 'px-4 py-2 text-sm',
                )}
                onClick={handleRestoreClick}
              >
                {t('Restore Session')}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Body: user query */}
        {s.firstMessage && (
          <div className="px-5 py-2">
            <div className="bg-blue-500/10 border-l-4 border-blue-500 rounded-r-lg px-3 py-2 md:px-4 md:py-3 overflow-x-hidden">
              <div
                className={cx(
                  'text-sm md:text-base font-semibold text-primary-text break-words whitespace-pre-wrap leading-snug md:leading-relaxed',
                  !isSelected && 'line-clamp-3',
                )}
              >
                {displayFirstMessage}
              </div>
            </div>
          </div>
        )}

        {/* AI Response Preview - collapsed */}
        {!isSelected && (
          <div className="px-5 pb-4">
            {s.type === 'single' && s.lastMessage && (
              <div className="flex items-start gap-1.5">
                {s.botIcons && s.botIcons[0] && (
                  <BotIcon iconName={s.botIcons[0]} size={16} className="shrink-0 mt-0.5" />
                )}
                <div className="text-xs text-primary-text opacity-75 line-clamp-2">{displayLastMessage}</div>
              </div>
            )}
            {s.type !== 'single' && displayBotResponses && displayBotResponses.length > 0 && (
              <div className="flex flex-col gap-1">
                {displayBotResponses.map((r, idx) => (
                  <div key={r.botName + idx} className="flex items-start gap-1.5">
                    {r.botIcon && <BotIcon iconName={r.botIcon} size={16} className="shrink-0 mt-0.5" />}
                    <div className="text-xs text-primary-text opacity-75 line-clamp-1">
                      <span className="font-semibold">{r.botName}:</span> {r.response}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Responses - expanded */}
        {isSelected && (
          <div className="px-5 pb-2">
            {s.type === 'single' && s.lastMessage && (
              <div className="mt-1">
                <div className="text-xs font-medium text-primary-text opacity-60 mb-2">{t('AI Response')}:</div>
                <div className="bg-green-500/10 border-l-2 border-green-500/50 rounded-r-lg px-3 py-2">
                  <div className="flex items-start gap-2">
                    {s.botIcons && s.botIcons[0] && (
                      <BotIcon iconName={s.botIcons[0]} size={18} className="shrink-0 mt-0.5" />
                    )}
                    <div className="text-sm text-primary-text opacity-90 break-words whitespace-pre-wrap leading-relaxed">
                      {displayLastMessage}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {s.type !== 'single' && displayBotResponses && displayBotResponses.length > 0 && (
              <div className="mt-1">
                <div className="text-xs font-medium text-primary-text opacity-60 mb-2">{t('AI Responses')}:</div>
                <div className="flex flex-wrap gap-3">
                  {displayBotResponses.map((r, idx) => (
                    <div
                      key={r.botName + idx}
                      className="bg-green-500/10 border-l-2 border-green-500/50 rounded-r-lg px-3 py-2 min-w-[240px] flex-1"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {r.botIcon && <BotIcon iconName={r.botIcon} size={16} />}
                        <div className="text-xs font-semibold text-green-600 dark:text-green-400">{r.botName}</div>
                      </div>
                      <div className="text-sm text-primary-text opacity-90 break-words whitespace-pre-wrap leading-relaxed">
                        {r.response}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.session === nextProps.session &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.onToggleSelect === nextProps.onToggleSelect &&
      prevProps.onRestore === nextProps.onRestore &&
      prevProps.onCopy === nextProps.onCopy &&
      prevProps.onDownloadMd === nextProps.onDownloadMd &&
      prevProps.onDownloadJson === nextProps.onDownloadJson &&
      prevProps.actionLoading === nextProps.actionLoading
    )
  },
)

SessionCard.displayName = 'SessionCard'

export default SessionCard
export type { SessionListItem }
