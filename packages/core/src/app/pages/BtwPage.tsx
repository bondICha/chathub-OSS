import { FC, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Browser from 'webextension-polyfill'
import { useChat } from '~app/hooks/use-chat'
import { getUserConfig } from '~services/user-config'
import Button from '~app/components/Button'
import ChatMessageList from '~app/components/Chat/ChatMessageList'

// ============================================================
// Serializable types for chrome.storage.session
// ============================================================

export interface StoredMessage {
  author: number | 'user'
  text: string
}

export interface StoredChatEntry {
  index: number
  messages: StoredMessage[]
}

export interface BtwStorageContext {
  query: string
  chats: StoredChatEntry[]
  sessionName?: string
}

// ============================================================
// BtwChatInner — chat logic (adapted from BtwDrawer)
// ============================================================

interface InnerHandle {
  send: (text: string) => void
}

interface InnerProps {
  botIndex: number
  chats: StoredChatEntry[]
  botNames: Record<number, string>
}

const BtwChatInner = forwardRef<InnerHandle, InnerProps>(({ botIndex, chats, botNames }, ref) => {
  const { t } = useTranslation()
  const btwChat = useChat(botIndex, 'btw')

  const buildContextPrefix = useCallback((): string | undefined => {
    const activePanels = chats.filter((c) => c.messages.length > 0)
    if (activePanels.length === 0) return undefined

    const panelTurns = activePanels.map((c) => {
      const name = botNames[c.index] || `Bot ${c.index + 1}`
      const pairs: Array<{ user: string; bot: string }> = []
      let i = 0
      while (i < c.messages.length) {
        const msg = c.messages[i]
        if (msg.author === 'user') {
          const userText = msg.text || ''
          const nextMsg = c.messages[i + 1]
          const botText =
            nextMsg && nextMsg.author !== 'user' ? nextMsg.text || '' : ''
          pairs.push({ user: userText, bot: botText })
          i += 2
        } else {
          i++
        }
      }
      return { name, pairs }
    })

    const maxTurns = Math.max(...panelTurns.map((p) => p.pairs.length))
    const systemPrompt = t('Btw context preamble')
    const comparisonPrompt = t('Btw comparison System-prompt')
    const lines: string[] = [systemPrompt, '']

    for (let turnIdx = 0; turnIdx < maxTurns; turnIdx++) {
      for (const panel of panelTurns) {
        const pair = panel.pairs[turnIdx]
        if (!pair) continue
        lines.push(`user: ${pair.user}`)
        if (pair.bot) {
          lines.push(`${panel.name}: ${pair.bot}`)
        }
      }
      lines.push('')
    }

    lines.push(comparisonPrompt)

    return lines.join('\n').trimEnd()
  }, [chats, botNames, t])

  useImperativeHandle(
    ref,
    () => ({
      send: (text: string) => {
        if (!text.trim() || btwChat.generating) return
        const contextPrefix = buildContextPrefix()
        btwChat.sendMessage(text, undefined, undefined, undefined, undefined, undefined, contextPrefix)
      },
    }),
    [btwChat, buildContextPrefix],
  )

  if (btwChat.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-secondary-text text-sm px-6 text-center">
        {t('Btw empty state')}
      </div>
    )
  }

  return (
    <ChatMessageList
      index={botIndex}
      messages={btwChat.messages}
      shouldAutoScroll={btwChat.shouldAutoScroll}
      setAutoScroll={btwChat.setAutoScroll}
    />
  )
})

BtwChatInner.displayName = 'BtwChatInner'

// ============================================================
// BtwPage — full-page popup UI
// ============================================================

interface BotEntry {
  index: number
  name: string
}

const BtwPage: FC = () => {
  const { t } = useTranslation()

  const [context, setContext] = useState<BtwStorageContext | null>(null)
  const [allBots, setAllBots] = useState<BotEntry[]>([])
  const [botNames, setBotNames] = useState<Record<number, string>>({})
  // -1 = not yet loaded from storage
  const [selectedBotIndex, setSelectedBotIndex] = useState<number>(-1)
  const [inputText, setInputText] = useState('')

  // Map of botIndex -> ref handle (preserves history across model switches)
  const chatRefs = useRef<Map<number, InnerHandle | null>>(new Map())
  // Track which bots have already received the initial query
  const sentInitialBots = useRef<Set<number>>(new Set())

  // Load context, all bots, and persisted selection in one shot
  useEffect(() => {
    Promise.all([
      Browser.storage.session.get('btwContext') as Promise<{ btwContext?: BtwStorageContext }>,
      getUserConfig(),
      Browser.storage.sync.get('btwSelectedBotIndex') as Promise<{ btwSelectedBotIndex?: number }>,
    ]).then(([sessionData, config, syncData]) => {
      const ctx = sessionData.btwContext
      if (ctx) {
        setContext(ctx)
        const name = ctx.sessionName
        document.title = name ? `BTW: ${name} - HuddleLLM` : 'BTW: HuddleLLM'
      }

      const bots: BotEntry[] = (config.customApiConfigs || [])
        .map((c, idx) => ({ index: idx, name: c.name || `Bot ${idx + 1}` }))
        .filter((_, idx) => (config.customApiConfigs![idx].enabled as boolean | undefined) !== false)

      setAllBots(bots)

      const names: Record<number, string> = {}
      bots.forEach(({ index, name }) => {
        names[index] = name
      })
      setBotNames(names)

      // Resolve selected bot: persisted value → first bot
      const saved = syncData.btwSelectedBotIndex
      if (saved !== undefined && bots.some((b) => b.index === saved)) {
        setSelectedBotIndex(saved)
      } else if (bots.length > 0) {
        setSelectedBotIndex(bots[0].index)
      }
    })
  }, [])

  // Send initial query to each bot the first time it's selected
  useEffect(() => {
    if (selectedBotIndex === -1 || !context?.query) return
    if (sentInitialBots.current.has(selectedBotIndex)) return
    sentInitialBots.current.add(selectedBotIndex)
    const timer = setTimeout(() => {
      chatRefs.current.get(selectedBotIndex)?.send(context.query)
    }, 200)
    return () => clearTimeout(timer)
  }, [selectedBotIndex, context])

  const handleSelectBot = useCallback((idx: number) => {
    setSelectedBotIndex(idx)
    Browser.storage.sync.set({ btwSelectedBotIndex: idx })
  }, [])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return
    chatRefs.current.get(selectedBotIndex)?.send(text)
    setInputText('')
  }, [inputText, selectedBotIndex])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  if (!context || selectedBotIndex === -1) {
    return (
      <div className="flex items-center justify-center h-screen bg-primary-background text-secondary-text text-sm">
        {t('Loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-primary-background text-primary-text">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-primary-border shrink-0">
        <span className="font-semibold text-sm text-btw">By The Way</span>
        {allBots.length > 1 && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="text-xs text-secondary-text">{t('Btw bot selector label')}:</span>
            <select
              className="text-xs rounded-md border border-primary-border bg-primary-background text-primary-text px-2 py-1 focus:outline-none focus:border-primary-blue"
              value={selectedBotIndex}
              onChange={(e) => handleSelectBot(Number(e.target.value))}
            >
              {allBots.map(({ index, name }) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Chat area — all bots mounted simultaneously; only active one is visible */}
      {allBots.map(({ index }) => (
        <div
          key={index}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
          style={{ display: index === selectedBotIndex ? 'flex' : 'none' }}
        >
          <BtwChatInner
            ref={(handle: InnerHandle | null) => chatRefs.current.set(index, handle)}
            botIndex={index}
            chats={context.chats}
            botNames={botNames}
          />
        </div>
      ))}

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-primary-border shrink-0">
        <input
          className="flex-1 text-sm bg-secondary rounded-xl px-3 py-2 outline-none text-primary-text placeholder:text-light-text"
          placeholder={t('Btw input placeholder')}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <Button text={t('Send')} color="primary" onClick={handleSend} disabled={!inputText.trim()} />
      </div>
    </div>
  )
}

export default BtwPage
