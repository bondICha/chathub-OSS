import { cx } from '~/utils'
import { FC, memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { IoCheckmarkSharp, IoCopyOutline, IoMegaphoneOutline as IoPropaganda } from 'react-icons/io5'
import { BsCheckAll } from "react-icons/bs";
import { LuCircleCheckBig } from "react-icons/lu";
import { GoFile } from 'react-icons/go';
import { AiOutlineFilePdf } from 'react-icons/ai';
import { BeatLoader } from 'react-spinners'
import { ChatMessageModel } from '~/types'
import Expandable from '../common/Expandable'
import Markdown from '../Markdown'
import MessageBubble from './MessageBubble'
import { useTranslation } from 'react-i18next'
import ExpandableDialog from '../ExpandableDialog'

const COPY_ICON_CLASS = 'self-top cursor-pointer invisible group-hover:visible mt-[6px] text-primary-text'
const RESET_TIMER_DURATION = 4000
const MESSAGE_HEIGHT_THRESHOLD = 200

interface Props {
  message: ChatMessageModel
  className?: string
  onPropaganda?: (text: string) => void
  onRetry?: () => void
}

interface SimpleTooltipProps {
  content: string;
  children: React.ReactNode;
  align?: 'center' | 'left' | 'right'
}

const SimpleTooltip: FC<SimpleTooltipProps> = ({ content, children, align = 'center' }) => {
  const [hovered, setHovered] = useState(false)

  const tooltipPositionClasses = useMemo(() => {
    let baseClasses = `absolute bottom-full mb-2 whitespace-pre z-[100] 
    bg-black bg-opacity-85 text-white px-4 py-2 rounded-md text-sm 
    before:content-[''] before:absolute before:top-full before:border-8 
    before:border-transparent before:border-t-black before:border-opacity-90 `

  if (align === 'center') {
      return baseClasses + 'left-1/2 transform -translate-x-1/2 before:left-1/2 before:-translate-x-1/2'
  } else if (align === 'right') {
      return baseClasses + 'right-0 before:right-4'
    } else {
      return baseClasses + 'left-0 before:left-4'
  }
  }, [align])

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span className={tooltipPositionClasses}>
          {content}
        </span>
      )}
    </span>
  );
};

type ConfirmationStage = 'none' | 'confirm' | 'final'

const ChatMessageCard: FC<Props> = ({ message, className, onPropaganda, onRetry }) => {
  const [copied, setCopied] = useState(false)
  const [messageHeight, setMessageHeight] = useState(0)
  const [confirmationStage, setConfirmationStage] = useState<ConfirmationStage>('none')
  const messageRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { t } = useTranslation()
  const [openedAttachment, setOpenedAttachment] = useState<{ name: string; content: string } | null>(null)
 

  const imageUrls = useMemo(() => {
    return message.images ? message.images.filter((img) => img instanceof Blob).map(img => URL.createObjectURL(img)) : []
  }, [message.images])

  useEffect(() => {
    return () => { imageUrls.forEach(url => URL.revokeObjectURL(url)) }
  }, [imageUrls])

  const audioUrls = useMemo(() => {
    return message.audioFiles ? message.audioFiles.filter((file) => file instanceof Blob).map(file => ({ url: URL.createObjectURL(file), name: (file as File).name })) : []
  }, [message.audioFiles])

  useEffect(() => {
    return () => { audioUrls.forEach(({ url }) => URL.revokeObjectURL(url)) }
  }, [audioUrls])

  const videoUrls = useMemo(() => {
    return message.videoFiles ? message.videoFiles.filter((file) => file instanceof Blob).map(file => ({ url: URL.createObjectURL(file), name: (file as File).name })) : []
  }, [message.videoFiles])

  useEffect(() => {
    return () => { videoUrls.forEach(({ url }) => URL.revokeObjectURL(url)) }
  }, [videoUrls])

  const pdfNames = useMemo(() => {
    return message.pdfFiles ? message.pdfFiles.map(file => file.name) : []
  }, [message.pdfFiles])

  const copyText = useMemo(() => {
    if (message.text) {
      return message.text
    }
    if (message.error) {
      return message.error.message
    }
  }, [message.error, message.text])

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  useEffect(() => {
    const updateHeight = () => {
      if (messageRef.current) {
        setMessageHeight(messageRef.current.offsetHeight)
      }
    }
    
    updateHeight()
    
    // ResizeObserverを使って動的に高さを監視
    const resizeObserver = new ResizeObserver(updateHeight)
    if (messageRef.current) {
      resizeObserver.observe(messageRef.current)
    }
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [message.text, message.error, message.thinking])


  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const resetConfirmation = useCallback(() => {
    setConfirmationStage('none')
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Reset UI state when this component instance is reused for a different message
  useEffect(() => {
    resetConfirmation()
    setCopied(false)
    setOpenedAttachment(null)
  }, [message.id, resetConfirmation])

  const startResetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setConfirmationStage('none')
      timerRef.current = null
    }, RESET_TIMER_DURATION)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!copyText) return
    const rawHtml = contentRef.current?.innerHTML ?? ''
    const div = document.createElement('div')
    div.innerHTML = rawHtml
    div.querySelectorAll<HTMLElement>('*').forEach((el) => {
      el.style.removeProperty('background-color')
      el.style.removeProperty('background')
    })
    const cleanHtml = div.innerHTML
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([cleanHtml], { type: 'text/html' }),
          'text/plain': new Blob([copyText], { type: 'text/plain' }),
        }),
      ])
      setCopied(true)
    } catch {
      try {
        await navigator.clipboard.writeText(copyText)
        setCopied(true)
      } catch { /* ignore */ }
    }
  }, [copyText])

  const handlePropagandaClick = useCallback(() => {
    if (confirmationStage === 'none') {
      setConfirmationStage('confirm')
      startResetTimer()
    } else if (confirmationStage === 'confirm') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmationStage('final')
      onPropaganda?.(message.text ?? '')
      startResetTimer()
    }
  }, [confirmationStage, message.text, onPropaganda, startResetTimer])

  const getTooltipContent = useCallback(() => {
    if (confirmationStage === 'confirm') {
      return t("Propaganda action is irreversible.\nClick again to confirm.")
    } else if (confirmationStage === 'final') {
      return t("Confirmed.")
    } else {
      return t("Propaganda👊")
    }
  }, [confirmationStage, t])

  const ActionButton = useCallback(() => (
    <div className="flex flex-col">
      <button
        aria-label={copied ? "Copied" : "Copy"}
        className={COPY_ICON_CLASS}
        onClick={handleCopy}
      >
        {copied ? <IoCheckmarkSharp /> : <IoCopyOutline />}
      </button>
      {message.author !== 'user' && onPropaganda && (
        <SimpleTooltip align="right" content={getTooltipContent()}>
          <button
            aria-label={getTooltipContent()}
              className={COPY_ICON_CLASS}
              onClick={handlePropagandaClick}
          >
            {confirmationStage === 'confirm' ? (
              <LuCircleCheckBig />
            ) : confirmationStage === 'final' ? (
              <BsCheckAll />
          ) : (
              <IoPropaganda />
          )}
          </button>
        </SimpleTooltip>
      )}
    </div>
  ), [copied, handleCopy, message.author, onPropaganda, confirmationStage, getTooltipContent, handlePropagandaClick])

  return (
    <div
      id={message.id}
      className={cx(
        'group flex w-full',
        message.author === 'user' ? 'flex-row-reverse' : 'flex-row',
        className,
      )}
    >
      <div ref={messageRef} className={cx('relative flex flex-col items-start gap-2 min-w-0', message.author === 'user' ? 'max-w-fit pl-12' : 'w-full')}>
        {!!copyText && (
          <>
            <div className="absolute right-1 top-1 z-10">
              <ActionButton />
            </div>
            {messageHeight > MESSAGE_HEIGHT_THRESHOLD && (
              <div className="absolute right-1 bottom-1 z-10">
                <ActionButton />
              </div>
            )}
          </>
        )}
        <MessageBubble
          color={message.author === 'user' ? 'primary' : 'flat'}
          thinking={message.thinking}
          searchResults={message.searchResults}
          isUserMessage={message.author === 'user'}
          fetchedUrls={message.fetchedUrls}
          referenceUrls={message.referenceUrls}
        >
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 my-2">
              {imageUrls.map((url, index) => (
                <img key={index} src={url} alt={`Uploaded content ${index + 1}`} className="max-w-xs" />
              ))}
            </div>
          )}
          {audioUrls.length > 0 && (
            <div className="flex flex-col gap-2 my-2 w-full max-w-xs">
              {audioUrls.map((audio, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <span className="text-xs opacity-70 truncate">{audio.name}</span>
                  <audio controls src={audio.url} className="w-full h-8" />
                </div>
              ))}
            </div>
          )}
          {videoUrls.length > 0 && (
            <div className="flex flex-col gap-2 my-2 w-full max-w-xs">
              {videoUrls.map((video, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <span className="text-xs opacity-70 truncate">{video.name}</span>
                  <video controls src={video.url} className="w-full rounded" />
                </div>
              ))}
            </div>
          )}
          {pdfNames.length > 0 && (
            <div className="flex flex-wrap gap-2 my-2">
              {pdfNames.map((name, index) => (
                <div key={index} className="flex items-center gap-1 bg-primary-border dark:bg-secondary rounded-full px-2 py-1 border border-primary-border">
                  <AiOutlineFilePdf size={12} className="text-red-500 dark:text-red-400 flex-shrink-0" />
                  <span className="text-xs text-primary-text font-semibold truncate max-w-[140px]">{name}</span>
                </div>
              ))}
            </div>
          )}
          <div ref={contentRef}>
          {message.text ? (
            message.author === 'user' ? (
              <div style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{message.text}</div>
            ) : (
              <Markdown>{message.text}</Markdown>
            )
          ) : (
            !message.error && (
              <div className="flex items-center justify-center py-1">
                <BeatLoader size={10} color="rgb(var(--color-primary-blue))" />
              </div>
            )
          )}
          </div>
          {message.author === 'user' && message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 my-2">
              {message.attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-primary-border dark:bg-secondary rounded-full px-2 py-1 border border-primary-border cursor-pointer"
                  onClick={() => setOpenedAttachment(att)}
                >
                  <span className="text-xs text-primary-text font-semibold cursor-default truncate max-w-[140px] ml-1">
                    {att.name}
                  </span>
                  <span className="text-xs text-secondary-text ml-1">({att.content.length} {t('chars')})</span>
                </div>
              ))}
            </div>
          )}

          {!!message.error && (
            <div className="text-[#cc0000] dark:text-[#ff0033] space-y-1">
              <p>{message.error.message}</p>
              {message.error.cause && (
                <Expandable
                  header={<p className="text-sm opacity-80">({t('Error Details')})</p>}
                  initiallyExpanded={false}
                >
                  <pre className="whitespace-pre-wrap text-sm">
                    {(() => {
                      try {
                        const causeObj = typeof message.error.cause === 'string'
                          ? JSON.parse(message.error.cause)
                          : message.error.cause;
                        return JSON.stringify(causeObj, null, 2);
                      } catch {
                        return String(message.error.cause);
                      }
                    })()}
                  </pre>
                </Expandable>
              )}
              {onRetry && (
                <button
                  className="mt-2 text-xs px-3 py-1 rounded border border-[#cc0000] dark:border-[#ff0033] text-[#cc0000] dark:text-[#ff0033] hover:bg-[#cc000015] dark:hover:bg-[#ff003315] transition-colors"
                  onClick={onRetry}
                >
                  {t('Retry')}
                </button>
              )}
            </div>
          )}
        </MessageBubble>
      </div>
      {/* Read-only attachment modal (footer left: characters, right: close) */}
      <ExpandableDialog
        open={!!openedAttachment}
        onClose={() => setOpenedAttachment(null)}
        title={openedAttachment?.name || ''}
        size="2xl"
        className="flex flex-col"
      >
        <div className="flex-grow p-4 overflow-y-auto">
          <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-800 rounded border">
            <pre className="whitespace-pre-wrap text-sm text-primary-text font-mono">
              {openedAttachment?.content || ''}
            </pre>
          </div>
        </div>
        <div className="flex justify-between items-center p-4 border-t border-primary-border">
          <span className="text-sm text-secondary-text">
            {t('Character count')}: {openedAttachment?.content.length || 0}
          </span>
          <button
            className="px-3 py-1 rounded bg-primary text-primary-background"
            onClick={() => setOpenedAttachment(null)}
          >
            {t('Close')}
          </button>
        </div>
      </ExpandableDialog>
    </div>
  )
}

export default memo(ChatMessageCard)
