import { FC, useCallback, useEffect, useRef } from 'react'
import { cx } from '~/utils'
import { useStickToBottom } from 'use-stick-to-bottom'
import { ChatMessageModel } from '~types'
import ChatMessageCard from './ChatMessageCard'
import ScrollToBottomButton from './ScrollToBottomButton'

interface Props {
  index: number
  messages: ChatMessageModel[]
  className?: string
  onPropaganda?: (text: string) => void
  onRetry?: (botMessageId: string) => void
  shouldAutoScroll?: boolean
  setAutoScroll?: (shouldAutoScroll: boolean) => void
}

const ChatMessageList: FC<Props> = (props) => {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom, stopScroll } = useStickToBottom({
    resize: 'smooth',
    initial: {
      mass: 0.8,
      damping: 0.7,
      stiffness: 0.1
    },
  })

  const prevIsAtBottomRef = useRef(isAtBottom)

  const interruptAutoScroll = useCallback(() => {
    if (!props.shouldAutoScroll) return
    stopScroll()
    props.setAutoScroll?.(false)
  }, [props.shouldAutoScroll, props.setAutoScroll, stopScroll])

  // 自動スクロール中にユーザーが操作したら、即座に自動スクロールを停止する
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const onWheel = () => interruptAutoScroll()
    const onTouchMove = () => interruptAutoScroll()
    const onKeyDown = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']
      if (keys.includes(e.key)) interruptAutoScroll()
    }
    const onPointerDown = (e: PointerEvent) => {
      // スクロールバー操作は target が container になることが多い（内容クリックは子要素になる）
      if (e.target === container) interruptAutoScroll()
    }

    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('keydown', onKeyDown)
    container.addEventListener('pointerdown', onPointerDown, { passive: true })

    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('pointerdown', onPointerDown)
    }
  }, [interruptAutoScroll, scrollRef])

  // shouldAutoScrollがfalseの場合はスクロールを停止、trueの場合はスクロールを再開
  useEffect(() => {
    if (props.shouldAutoScroll === false) {
      stopScroll()
    } else {
      // shouldAutoScrollがtrueになったら最下部にスクロール
      scrollToBottom()
    }
  }, [props.shouldAutoScroll, stopScroll, scrollToBottom])

  // ユーザーが最下部へ戻った時のみ自動スクロールを再開する
  useEffect(() => {
    const prev = prevIsAtBottomRef.current
    prevIsAtBottomRef.current = isAtBottom

    if (!prev && isAtBottom && props.shouldAutoScroll === false) {
      props.setAutoScroll?.(true)
    }
  }, [isAtBottom, props.setAutoScroll, props.shouldAutoScroll])

  // 新しいメッセージが追加されたときに自動スクロールを確認
  useEffect(() => {
    if (props.shouldAutoScroll) {
      scrollToBottom()
    }
  }, [props.messages, props.shouldAutoScroll, scrollToBottom])

  return (
    <div className="flex-1 relative overflow-hidden">
      <div ref={scrollRef} className="h-full overflow-auto custom-scrollbar focus:outline-none" tabIndex={0}>
        <div ref={contentRef} className={cx('flex flex-col gap-3', props.className)}>
          {(() => {
            // 最後の bot メッセージのみ retry を許可 (会話途中の retry は履歴整合性が壊れるため)
            let lastBotIdx = -1
            for (let i = props.messages.length - 1; i >= 0; i--) {
              if (props.messages[i].author !== 'user') { lastBotIdx = i; break }
            }
            return props.messages.map((message, index) => {
              const retryHandler = index === lastBotIdx && message.error && props.onRetry
                ? () => props.onRetry!(message.id)
                : undefined
              return (
                <ChatMessageCard
                  key={message.id}
                  message={message}
                  className={index === 0 ? 'mt-5' : undefined}
                  onPropaganda={props.onPropaganda}
                  onRetry={retryHandler}
                />
              )
            })
          })()}
        </div>
      </div>
      {!isAtBottom && <ScrollToBottomButton onClick={scrollToBottom} />}
    </div>
  )
}

export default ChatMessageList
