import { FC, memo, useCallback, useEffect, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import Browser from 'webextension-polyfill'
import { allInOneInputTextAtom, allInOneInputAttachmentsAtom } from '~app/state'
import { Layout } from '~app/consts'
import Button from '../Button'
import ChatMessageInput from './ChatMessageInput'
import LayoutSwitch from './LayoutSwitch'

const BTW_HINT_DISMISSED_KEY = 'btwHintDismissed'

interface Props {
  layout: Layout
  generating: boolean
  supportImageInput?: boolean
  hasUserResized: boolean
  showBtwHint?: boolean
  onLayoutChange: (layout: Layout) => void
  onSubmit: (input: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => void
  onHeightChange: (height: number) => void
  onBtwCommand?: (query: string) => void
}

const AllInOneInputArea: FC<Props> = memo(({
  layout,
  generating,
  supportImageInput,
  hasUserResized,
  showBtwHint,
  onLayoutChange,
  onSubmit,
  onHeightChange,
  onBtwCommand,
}) => {
  const { t } = useTranslation()

  const [inputText, setInputText] = useAtom(allInOneInputTextAtom)
  const [inputAttachments, setInputAttachments] = useAtom(allInOneInputAttachmentsAtom)

  // Btw hint banner state
  const [hintDismissed, setHintDismissed] = useState(true) // default hidden until loaded
  useEffect(() => {
    Browser.storage.local.get(BTW_HINT_DISMISSED_KEY).then((data) => {
      setHintDismissed(!!data[BTW_HINT_DISMISSED_KEY])
    })
  }, [])

  const hintVisible = !!showBtwHint && !hintDismissed

  const dismissHint = useCallback(() => {
    setHintDismissed(true)
    // Persistent dismiss disabled for now — hint reappears each session
    // Browser.storage.local.set({ [BTW_HINT_DISMISSED_KEY]: true })
  }, [])

  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up typing animation on unmount
  useEffect(() => () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current) }, [])

  const handleTryBtw = useCallback(() => {
    const prefix = '/btw '
    const fullText = `${prefix}${t('Btw hint default query')}`
    let i = 0
    setInputText('')
    dismissHint()

    const typeNext = () => {
      i++
      setInputText(fullText.slice(0, i))
      if (i < fullText.length) {
        const delay = i <= prefix.length ? 250 : 50
        typeTimerRef.current = setTimeout(typeNext, delay)
      }
    }
    typeTimerRef.current = setTimeout(typeNext, 250)
  }, [setInputText, dismissHint, t])

  const handleSubmit = (input: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => {
    const trimmed = input.trim()
    if (trimmed.startsWith('/btw')) {
      onBtwCommand?.(trimmed.slice(4).trim())
      return
    }
    onSubmit(input, images, attachments, audioFiles, videoFiles, pdfFiles)
  }

  return (
    <div className="flex flex-col flex-grow min-h-0 overflow-hidden">
      {/* Btw hint banner */}
      {hintVisible && (
        <div className="flex items-center gap-3 px-4 py-2 mx-2 mb-1 rounded-xl text-sm shrink-0 animate-slideUpAndFade border border-primary-border bg-primary-background">
          <span className="flex-1 text-btw">{t('Btw hint message')}</span>
          <button
            onClick={handleTryBtw}
            className="shrink-0 px-3 py-1 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: 'rgb(var(--color-primary-blue))' }}
          >
            {t('Btw hint try button')}
          </button>
          <button
            onClick={dismissHint}
            className="shrink-0 text-xs text-secondary-text hover:text-primary-text"
          >
            {t('Btw hint dismiss')}
          </button>
        </div>
      )}
      {/* Input row */}
      <div className="flex flex-row gap-2 flex-grow min-h-0 overflow-hidden">
        <LayoutSwitch layout={layout} onChange={onLayoutChange} />
        <ChatMessageInput
          mode="full"
          className={`rounded-2xl bg-primary-background px-4 py-2 grow ${!hasUserResized ? 'max-h-full overflow-hidden' : ''}`}
          disabled={generating}
          onSubmit={handleSubmit}
          actionButton={!generating && <Button text={t('Send')} color="primary" type="submit" />}
          autoFocus={true}
          supportImageInput={supportImageInput}
          fullHeight={hasUserResized}
          maxRows={hasUserResized ? undefined : 12}
          onHeightChange={onHeightChange}
          controlledValue={inputText}
          onControlledValueChange={setInputText}
          controlledAttachments={inputAttachments}
          onControlledAttachmentsChange={setInputAttachments}
          placeholder={t('allinone_input_placeholder')}
        />
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.generating === nextProps.generating &&
    prevProps.layout === nextProps.layout &&
    prevProps.supportImageInput === nextProps.supportImageInput &&
    prevProps.hasUserResized === nextProps.hasUserResized &&
    prevProps.showBtwHint === nextProps.showBtwHint &&
    prevProps.onLayoutChange === nextProps.onLayoutChange &&
    prevProps.onBtwCommand === nextProps.onBtwCommand
  )
})

export default AllInOneInputArea
