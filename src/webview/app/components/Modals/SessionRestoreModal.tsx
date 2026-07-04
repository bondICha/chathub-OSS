import { FC, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Dialog, Tab } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { loadHistoryMessages, loadSessionSnapshots, loadLatestSession, loadNext3Sessions } from '~services/chat-history'
import { sessionRestoreModalAtom, sessionToRestoreAtom, themeColorAtom } from '~app/state'
import { getUserConfig } from '~services/user-config'
import dayjs from 'dayjs'
import { ChevronDownIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

interface SessionData {
  type: 'single' | 'sessionSnapshot'
  botIndex?: number
  conversationId?: string
  sessionUUID?: string
  botIndices?: number[]
  layout?: string
  pairName?: string
  createdAt: number
  lastUpdated: number
  messageCount: number
  lastMessage: string
  firstMessage?: string
  botNames?: string[]
  botResponses?: { botName: string; response: string }[]
  snapshotMessages?: { [botIndex: number]: any[] }
}

const SessionRestoreModal: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useAtom(sessionRestoreModalAtom)
  const setSessionToRestore = useSetAtom(sessionToRestoreAtom)
  const themeColor = useAtomValue(themeColorAtom)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showingTop3, setShowingTop3] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [loadedSessionCount, setLoadedSessionCount] = useState(0)
  const [hasMoreSessions, setHasMoreSessions] = useState(true)
  const [allSessionsLoaded, setAllSessionsLoaded] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [allSessionsData, setAllSessionsData] = useState<SessionData[]>([])
  const [lastKeyPressed, setLastKeyPressed] = useState<string>('')
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [showDebug, setShowDebug] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // 検索機能用のフィルタリング（全文検索）
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) {
      return sessions
    }
    
    const searchLower = searchTerm.toLowerCase()
    return sessions.filter(session => {
      // 基本情報で検索
      const firstMessageMatch = session.firstMessage?.toLowerCase().includes(searchLower)
      const lastMessageMatch = session.lastMessage?.toLowerCase().includes(searchLower)
      const botNameMatch = session.botNames?.some(name => name.toLowerCase().includes(searchLower))
      const pairNameMatch = session.pairName?.toLowerCase().includes(searchLower)
      
      // 全メッセージで検索（All-in-Oneセッションの場合）
      let fullTextMatch = false
      if (session.type === 'sessionSnapshot' && session.snapshotMessages) {
        // 各ボットの全メッセージを検索
        for (const botMessages of Object.values(session.snapshotMessages)) {
          if (botMessages && Array.isArray(botMessages)) {
            fullTextMatch = botMessages.some(msg => 
              msg.text && msg.text.toLowerCase().includes(searchLower)
            )
            if (fullTextMatch) break
          }
        }
      }
      
      // botレスポンスで検索
      const botResponseMatch = session.botResponses?.some(response => 
        response.response.toLowerCase().includes(searchLower)
      )
      
      return firstMessageMatch || lastMessageMatch || botNameMatch || pairNameMatch || fullTextMatch || botResponseMatch
    })
  }, [sessions, searchTerm])

  const scrollToSelectedItem = useCallback(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector('.bg-blue-600') as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      }
    }
  }, [])

  const getBotName = useCallback(async (botIndex: number): Promise<string> => {
    try {
      const { customApiConfigs } = await getUserConfig()
      const config = customApiConfigs[botIndex]
      if (config && config.name) {
        return config.name
      }
    } catch (error) {
      console.error('Failed to get bot name:', error)
    }
    return `Custom Bot ${botIndex + 1}`
  }, [])

  useEffect(() => {
    scrollToSelectedItem()
  }, [selectedIndex, activeTab, scrollToSelectedItem])

  const loadNext3SessionsData = useCallback(async () => {
    try {
      const next3Sessions = await loadNext3Sessions()
      const convertedSessions: SessionData[] = []

      for (const session of next3Sessions) {
        // 全てSessionSnapshotなので、直接変換
        const snapshot = session
        let lastMessage = ''
        let firstMessage = ''
        const botNames: string[] = []

        // ボット名を取得
        if (snapshot.botIndices) {
          for (const botIndex of snapshot.botIndices) {
            const name = await getBotName(botIndex)
            botNames.push(name)
          }
        }

        // 最初のメッセージと各AIの返答を取得
        const botResponses: { botName: string; response: string }[] = []

        // 全メッセージから最初のユーザーメッセージを取得
        const allMessages = Object.values(snapshot.conversations).flat()
        if (allMessages.length > 0) {
          const firstUserMsg = allMessages.find(msg => msg.author === 'user')
          if (firstUserMsg && firstUserMsg.text) {
            firstMessage = firstUserMsg.text.slice(0, 100) + (firstUserMsg.text.length > 100 ? '...' : '')
          }
        }

        // 各AIの最後の返答を個別に取得
        if (snapshot.botIndices) {
          for (let i = 0; i < snapshot.botIndices.length; i++) {
            const botIndex = snapshot.botIndices[i]
            const botName = botNames[i] || `Bot ${botIndex + 1}`
            const botMessages = snapshot.conversations[botIndex]?.filter(msg => msg.author !== 'user') || []

            if (botMessages.length > 0) {
              const lastBotMsg = botMessages[botMessages.length - 1]
              if (lastBotMsg && lastBotMsg.text) {
                const response = lastBotMsg.text.slice(0, 100) + (lastBotMsg.text.length > 100 ? '...' : '')
                botResponses.push({ botName, response })
              }
            } else {
              botResponses.push({ botName, response: 'No response' })
            }
          }
        }

        lastMessage = botResponses.length > 0 ? botResponses[0].response : 'No messages'

        convertedSessions.push({
          type: 'sessionSnapshot',
          sessionUUID: snapshot.sessionUUID,
          botIndices: snapshot.botIndices,
          layout: snapshot.layout,
          pairName: snapshot.pairName,
          createdAt: snapshot.createdAt,
          lastUpdated: snapshot.lastUpdated,
          messageCount: snapshot.totalMessageCount,
          lastMessage: lastMessage || 'No messages',
          firstMessage: firstMessage || 'No messages',
          botNames,
          botResponses,
          snapshotMessages: snapshot.conversations,
        })
      }

      // 既存のセッションに追加してlastUpdatedで再ソート
      setSessions(prevSessions => {
        const combinedSessions = [...prevSessions, ...convertedSessions]
        // lastUpdatedで降順ソートして常に最新順を維持
        return combinedSessions.sort((a, b) => b.lastUpdated - a.lastUpdated)
      })
      setShowingTop3(true)
    } catch (error) {
      console.error('Failed to load latest 3 sessions:', error)
    }
  }, [getBotName])

  const loadLatestSessionOnly = useCallback(async () => {
    try {
      const latestSession = await loadLatestSession()
      if (latestSession) {
        // SessionSnapshotの場合の変換
        if ('sessionUUID' in latestSession) {
          const snapshot = latestSession
          let lastMessage = ''
          let firstMessage = ''
          const botNames: string[] = []

          // ボット名を取得
          if (snapshot.botIndices) {
            for (const botIndex of snapshot.botIndices) {
              const name = await getBotName(botIndex)
              botNames.push(name)
            }
          }

          // 最初のメッセージと各AIの返答を取得
          const botResponses: { botName: string; response: string }[] = []

          // 全メッセージから最初のユーザーメッセージを取得
          const allMessages = Object.values(snapshot.conversations).flat()
          if (allMessages.length > 0) {
            const firstUserMsg = allMessages.find(msg => msg.author === 'user')
            if (firstUserMsg && firstUserMsg.text) {
              firstMessage = firstUserMsg.text.slice(0, 100) + (firstUserMsg.text.length > 100 ? '...' : '')
            }
          }

          // 各AIの最後の返答を個別に取得
          if (snapshot.botIndices) {
            for (let i = 0; i < snapshot.botIndices.length; i++) {
              const botIndex = snapshot.botIndices[i]
              const botName = botNames[i] || `Bot ${botIndex + 1}`
              const botMessages = snapshot.conversations[botIndex]?.filter(msg => msg.author !== 'user') || []

              if (botMessages.length > 0) {
                const lastBotMsg = botMessages[botMessages.length - 1]
                if (lastBotMsg && lastBotMsg.text) {
                  const response = lastBotMsg.text.slice(0, 100) + (lastBotMsg.text.length > 100 ? '...' : '')
                  botResponses.push({ botName, response })
                }
              } else {
                botResponses.push({ botName, response: 'No response' })
              }
            }
          }

          lastMessage = botResponses.length > 0 ? botResponses[0].response : 'No messages'

          const sessionData: SessionData = {
            type: 'sessionSnapshot',
            sessionUUID: snapshot.sessionUUID,
            botIndices: snapshot.botIndices,
            layout: snapshot.layout,
            pairName: snapshot.pairName,
            createdAt: snapshot.createdAt,
            lastUpdated: snapshot.lastUpdated,
            messageCount: snapshot.totalMessageCount,
            lastMessage: lastMessage || 'No messages',
            firstMessage: firstMessage || 'No messages',
            botNames,
            botResponses,
            snapshotMessages: snapshot.conversations,
          }

          setSessions([sessionData])
        } else {
          // ConversationWithMessagesの場合の変換（個別ボットセッション）
          const conversation = latestSession
          // botIndexを取得する必要があります（現在の実装では不明なため、改善が必要）
          // とりあえず0として処理
          const botIndex = 0 // TODO: 実際のbotIndexを取得
          const botName = await getBotName(botIndex)
          const firstMessage = conversation.messages.find(msg => msg.author === 'user')
          const lastBotMessage = conversation.messages.filter(msg => msg.author !== 'user').pop()

          const sessionData: SessionData = {
            type: 'single',
            botIndex,
            conversationId: conversation.id,
            createdAt: conversation.createdAt,
            lastUpdated: conversation.createdAt,
            messageCount: conversation.messages.length,
            lastMessage: lastBotMessage?.text ? (lastBotMessage.text.slice(0, 100) + (lastBotMessage.text.length > 100 ? '...' : '')) : 'No messages',
            firstMessage: firstMessage?.text ? (firstMessage.text.slice(0, 100) + (firstMessage.text.length > 100 ? '...' : '')) : 'No messages',
            botNames: [botName],
          }

          setSessions([sessionData])
        }
      }
      setLoading(false)
    } catch (error) {
      console.error('Failed to load latest session:', error)
      setLoading(false)
    }
  }, [getBotName])

  const loadSessions = useCallback(async (append: boolean = false) => {
    const wasLoading = loading
    if (!wasLoading) setLoading(true)
    try {
      const allSessions: SessionData[] = []

      const sessionSnapshots = await loadSessionSnapshots()
      for (const snapshot of sessionSnapshots) {
        let lastMessage = ''
        let firstMessage = ''
        const botNames: string[] = []

        // ボット名を取得
        if (snapshot.botIndices) {
          for (const botIndex of snapshot.botIndices) {
            const name = await getBotName(botIndex)
            botNames.push(name)
          }
        }

        // 最初のメッセージと各AIの返答を取得
        const botResponses: { botName: string; response: string }[] = []

        // 全メッセージから最初のユーザーメッセージを取得
        const allMessages = Object.values(snapshot.conversations).flat()
        if (allMessages.length > 0) {
          const firstUserMsg = allMessages.find(msg => msg.author === 'user')
          if (firstUserMsg && firstUserMsg.text) {
            firstMessage = firstUserMsg.text.slice(0, 100) + (firstUserMsg.text.length > 100 ? '...' : '')
          }
        }

        // 各AIの最後の返答を個別に取得
        if (snapshot.botIndices) {
          for (let i = 0; i < snapshot.botIndices.length; i++) {
            const botIndex = snapshot.botIndices[i]
            const botName = botNames[i] || `Bot ${botIndex + 1}`
            const botMessages = snapshot.conversations[botIndex]?.filter(msg => msg.author !== 'user') || []

            if (botMessages.length > 0) {
              const lastBotMsg = botMessages[botMessages.length - 1]
              if (lastBotMsg && lastBotMsg.text) {
                const response = lastBotMsg.text.slice(0, 100) + (lastBotMsg.text.length > 100 ? '...' : '')
                botResponses.push({ botName, response })
              }
            } else {
              botResponses.push({ botName, response: 'No response' })
            }
          }
        }

        // 従来のlastMessageは最初のボットの応答または統合メッセージ
        lastMessage = botResponses.length > 0 ? botResponses[0].response : 'No messages'

        allSessions.push({
          type: 'sessionSnapshot',
          sessionUUID: snapshot.sessionUUID,
          botIndices: snapshot.botIndices,
          layout: snapshot.layout,
          pairName: snapshot.pairName,
          createdAt: snapshot.createdAt,
          lastUpdated: snapshot.lastUpdated,
          messageCount: snapshot.totalMessageCount,
          lastMessage: lastMessage || 'No messages',
          firstMessage: firstMessage || 'No messages',
          botNames,
          botResponses,
          snapshotMessages: snapshot.conversations,
        })
      }

      for (let botIndex = 0; botIndex < 10; botIndex++) {
        const conversations = await loadHistoryMessages(botIndex)
        for (const conversation of conversations) {
          if (conversation.messages.length > 0) {
            const botName = await getBotName(botIndex)
            const firstMessage = conversation.messages.find(msg => msg.author === 'user')
            const lastBotMessage = conversation.messages.filter(msg => msg.author !== 'user').pop()

            allSessions.push({
              type: 'single',
              botIndex,
              conversationId: conversation.id,
              createdAt: conversation.createdAt,
              lastUpdated: conversation.createdAt,
              messageCount: conversation.messages.length,
              lastMessage: lastBotMessage?.text ? (lastBotMessage.text.slice(0, 100) + (lastBotMessage.text.length > 100 ? '...' : '')) : 'No messages',
              firstMessage: firstMessage?.text ? (firstMessage.text.slice(0, 100) + (firstMessage.text.length > 100 ? '...' : '')) : 'No messages',
              botNames: [botName],
            })
          }
        }
      }

      allSessions.sort((a, b) => b.lastUpdated - a.lastUpdated)
      
      // 全セッションを保存（検索用）
      setAllSessionsData(allSessions)
      
      if (append) {
        // 追加読み込みの場合：現在表示中のセッションから次の50件を取得
        setSessions(prev => {
          const currentSnapshots = prev.filter(s => s.type === 'sessionSnapshot')
          const currentSingles = prev.filter(s => s.type === 'single')
          
          const allSnapshots = allSessions.filter(s => s.type === 'sessionSnapshot')
          const allSingles = allSessions.filter(s => s.type === 'single')
          
          // 両方のタイプのセッションを追加読み込み
          const nextBatch = allSessions.slice(prev.length, prev.length + 50)
          
          // 既存のセッションに追加（ソートはしない）
          const updatedSessions = [...prev, ...nextBatch]
          
          // hasMore判定: まだ読み込んでいないセッションがあるか
          const hasMore = updatedSessions.length < allSessions.length
          setHasMoreSessions(hasMore)
          setAllSessionsLoaded(!hasMore && nextBatch.length > 0)
          
          
          return updatedSessions
        })
      } else {
        // 初回読み込みの場合：最初の50件
        const initialBatch = allSessions.slice(0, 50)
        setSessions(initialBatch)
        setLoadedSessionCount(initialBatch.length)
        const hasMore = initialBatch.length < allSessions.length
        setHasMoreSessions(hasMore)
        setAllSessionsLoaded(false)
        
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
      if (!append) {
        setSessions([])
      }
    } finally {
      setLoading(false)
    }
  }, [getBotName, loadedSessionCount])

  const loadMoreSessions = useCallback(async () => {
    setLoadingMore(true)
    setIsExpanded(true) // Modal高さを最大化
    try {
      // 追加のセッションを読み込み
      await loadSessions(true)
    } catch (error) {
      console.error('Failed to load more sessions:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [loadSessions, activeTab])

  useEffect(() => {
    if (open) {
      // 初期リセット
      setSessions([])
      setShowingTop3(false)
      setLoadingMore(false)
      setIsExpanded(false)
      setLoading(true)
      setLoadedSessionCount(0)
      setHasMoreSessions(true)
      setAllSessionsLoaded(false)
      setAllSessionsData([])
      setSearchTerm('')

      // Phase 1: 最新1セッションを読み込み
      loadLatestSessionOnly().then(() => {
        // Phase 2: 少し遅れて2-4件目を追加
        setTimeout(() => {
          loadNext3SessionsData()
        }, 200)
      })

      setSelectedIndex(-1) // -1 means "Start new session" is selected
      setActiveTab(0) // All-in-One tab (index 0) as default

      // フォーカスを設定
      setTimeout(() => {
        const panel = document.querySelector('[role="dialog"]') as HTMLElement
        if (panel) {
          panel.focus()
        }
      }, 100)
    }
  }, [open, loadLatestSessionOnly, loadNext3SessionsData])

  const handleRestore = useCallback((session: SessionData) => {
    setOpen(false)
    setSessionToRestore(session)
    if (session.type === 'single') {
      navigate({ to: `/chat/custom/${session.botIndex}` })
    } else {
      navigate({ to: '/' })
    }
  }, [setOpen, setSessionToRestore, navigate])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return

    setLastKeyPressed(e.key)

    const currentSessions = activeTab === 0
      ? filteredSessions.filter(s => s.type === 'sessionSnapshot')
      : filteredSessions.filter(s => s.type === 'single')

    if (showDebug) setDebugInfo(`Key received: ${e.key}, currentSessions: ${currentSessions.length}`)

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(prev => {
          const newIndex = Math.max(-1, prev - 1)
          if (showDebug) setDebugInfo(`ArrowUp: ${prev} → ${newIndex}`)
          return newIndex
        })
        break
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(prev => {
          const maxIndex = currentSessions.length - 1
          const newIndex = Math.min(maxIndex, prev + 1)
          if (showDebug) setDebugInfo(`ArrowDown: ${prev} → ${newIndex} (max: ${maxIndex})`)
          return newIndex
        })
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (showDebug) setDebugInfo(`Enter pressed! Index: ${selectedIndex}, Sessions: ${currentSessions.length}`)
        setTimeout(() => {
          if (selectedIndex === -1) {
            if (showDebug) setDebugInfo(`Enter: Starting new session`)
            setOpen(false)
            navigate({ to: '/' })
          } else if (selectedIndex >= 0 && selectedIndex < currentSessions.length) {
            const session = currentSessions[selectedIndex]
            if (showDebug) setDebugInfo(`Enter: Restoring session type: ${session.type}`)
            handleRestore(session)
          } else {
            if (showDebug) setDebugInfo(`Enter: Index out of range (${selectedIndex} >= ${currentSessions.length})`)
            setOpen(false)
            navigate({ to: '/' })
          }
        }, 10)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        if (showDebug) setDebugInfo(`Escape: Closing modal`)
        setOpen(false)
        break
      default:
        if (showDebug) setDebugInfo(`Key: ${e.key} (not handled)`)
    }
  }, [open, filteredSessions, selectedIndex, activeTab, navigate, handleRestore, showDebug])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown, { capture: true })
      return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [handleKeyDown, open])

  const handleItemClick = (session: SessionData) => {
    handleRestore(session)
  }

  const handleDeleteSession = async (_session: SessionData, e: React.MouseEvent) => {
    e.stopPropagation() // セッションをクリックしてRestoreしないように

    alert('Session削除機能は現在実装中です。今は、各Chatbotの履歴画面から削除してください。\n\nSession deletion feature is currently under development. Please delete from each Chatbot\'s history page.\n\n会话删除功能正在开发中。请从各聊天机器人的历史页面删除。')
  }

  const handleDeleteAllSessions = async () => {
    alert('Session削除機能は現在実装中です。今は、各Chatbotの履歴画面から削除してください。\n\nSession deletion feature is currently under development. Please delete from each Chatbot\'s history page.\n\n会话删除功能正在开发中。请从各聊天机器人的历史页面删除。')
  }

  const renderSessionItem = (session: SessionData, _index: number, isSelected: boolean) => (
    <div
      key={session.sessionUUID || `${session.botIndex}-${session.conversationId}`}
      className={`p-3 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      onClick={() => handleItemClick(session)}
    >
      <div className="flex items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">
              {session.botNames && session.botNames.length > 0
                ? session.botNames.join(', ')
                : (session.type === 'sessionSnapshot'
                  ? (session.pairName || `All-in-One (${session.botIndices?.length} bots)`)
                  : `Custom Bot ${session.botIndex! + 1}`
                )
              }
            </span>
            <span className="text-xs opacity-75">{session.messageCount} messages</span>
          </div>
          <div className="text-sm opacity-75 mb-1">
            {dayjs(session.createdAt).format('YYYY/MM/DD HH:mm')}
          </div>
          {session.firstMessage && (
            <div className="text-xs opacity-50 mb-1">
              <span className="font-medium">Q:</span> {session.firstMessage}
            </div>
          )}
          {session.botResponses && session.botResponses.length > 0 ? (
            session.botResponses.map((response, idx) => (
              <div key={idx} className="text-xs opacity-50 mb-1">
                <span className="font-medium">{response.botName}:</span> {response.response}
              </div>
            ))
          ) : (
            <div className="text-xs opacity-50">
              <span className="font-medium">A:</span> {session.lastMessage}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => handleDeleteSession(session, e)}
            className="p-1 rounded hover:bg-red-600 hover:bg-opacity-20 transition-colors"
            title="Delete session"
          >
            <TrashIcon className="w-4 h-4 text-red-400 hover:text-red-300" />
          </button>
          {isSelected && <ChevronDownIcon className="w-5 h-5 ml-2" />}
        </div>
      </div>
    </div>
  )

  const handleStartNewSession = () => {
    setOpen(false)
    navigate({ to: '/' })
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel
          className={`mx-auto ${isExpanded ? 'max-w-6xl' : 'max-w-2xl'} w-full ${isExpanded ? 'h-[93vh]' : 'h-[75vh]'} backdrop-blur-md rounded-lg shadow-2xl border transition-all duration-300 flex flex-col`}
          style={{
            backgroundColor: themeColor ? `${themeColor}40` : 'rgba(17, 24, 39, 0.25)', // 25% opacity for more transparency
            borderColor: themeColor ? `${themeColor}66` : 'rgba(75, 85, 99, 0.4)' // 40% opacity
          }}
          tabIndex={-1}
          onKeyDown={(e) => handleKeyDown(e.nativeEvent)}
        >
          <div className="p-4 flex flex-col flex-grow min-h-0">
            <Dialog.Title className="text-xl font-semibold text-white mb-2 text-center">
              {t('Restore Session')}
            </Dialog.Title>
            <div className="text-sm text-white mb-1 text-center">
              {t('Use ↑↓ keys to navigate, Enter to select, Esc to close')}
              <p className="text-xs text-white mt-1">{t('Images in chat history will not be restored.')}</p>
              <div className="mt-1">
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-xs text-gray-400 hover:text-gray-300 underline"
                >
                  {showDebug ? 'Hide Debug' : 'Show Debug'}
                </button>
                {showDebug && (
                  <div className="text-xs text-yellow-300 mt-1 bg-black/50 p-1 rounded">
                    <div>Debug: selectedIndex={selectedIndex}, activeTab={activeTab}</div>
                    <div>Sessions total: {sessions.length}</div>
                    <div>All-in-One sessions: {sessions.filter(s => s.type === 'sessionSnapshot').length} (filtered: {filteredSessions.filter(s => s.type === 'sessionSnapshot').length})</div>
                    <div>Single bot sessions: {sessions.filter(s => s.type === 'single').length} (filtered: {filteredSessions.filter(s => s.type === 'single').length})</div>
                    <div>Current tab sessions: {activeTab === 0 ? filteredSessions.filter(s => s.type === 'sessionSnapshot').length : filteredSessions.filter(s => s.type === 'single').length}</div>
                    <div>Max index: {(activeTab === 0 ? sessions.filter(s => s.type === 'sessionSnapshot').length : sessions.filter(s => s.type === 'single').length) - 1}</div>
                    <div>States: loading={loading.toString()}, showingTop3={showingTop3.toString()}, isExpanded={isExpanded.toString()}</div>
                    <div>hasMoreSessions: {hasMoreSessions.toString()}, allSessionsLoaded: {allSessionsLoaded.toString()}</div>
                    <div>Last key: {lastKeyPressed}</div>
                    <div className="text-cyan-300">{debugInfo}</div>
                  </div>
                )}
              </div>
            </div>

            <Tab.Group selectedIndex={activeTab} onChange={(index) => {
              setActiveTab(index)
              setSelectedIndex(-1) // Always start with "Start new session"
            }}>
              {/* Responsive header with tabs and search */}
              <div className="mb-2">
                {/* When wide enough, show tabs, search, and remove button in one row */}
                <div className="hidden lg:flex justify-between items-center gap-4">
                  <Tab.List className="flex space-x-4 flex-shrink-0">
                    <Tab className="px-4 py-2 text-sm font-medium leading-5 rounded-lg focus:outline-none transition-colors ui-selected:bg-blue-600 ui-selected:text-white ui-not-selected:bg-gray-600 ui-not-selected:text-gray-100 ui-not-selected:hover:bg-gray-500">
                      All-in-One
                    </Tab>
                    <Tab className="px-4 py-2 text-sm font-medium leading-5 rounded-lg focus:outline-none transition-colors ui-selected:bg-blue-600 ui-selected:text-white ui-not-selected:bg-gray-600 ui-not-selected:text-gray-100 ui-not-selected:hover:bg-gray-500">
                      Single bots
                    </Tab>
                  </Tab.List>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Search sessions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    onClick={handleDeleteAllSessions}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors border border-red-500 flex-shrink-0"
                    title="Delete all sessions in current tab"
                  >
                    Remove All
                  </button>
                </div>
                {/* When narrow, show tabs and remove button first, then search below */}
                <div className="lg:hidden">
                    <div className="flex justify-between items-center mb-2">
                      <Tab.List className="flex space-x-4">
                        <Tab className="px-4 py-2 text-sm font-medium leading-5 rounded-lg focus:outline-none transition-colors ui-selected:bg-blue-600 ui-selected:text-white ui-not-selected:bg-gray-600 ui-not-selected:text-gray-100 ui-not-selected:hover:bg-gray-500">
                          All-in-One
                        </Tab>
                        <Tab className="px-4 py-2 text-sm font-medium leading-5 rounded-lg focus:outline-none transition-colors ui-selected:bg-blue-600 ui-selected:text-white ui-not-selected:bg-gray-600 ui-not-selected:text-gray-100 ui-not-selected:hover:bg-gray-500">
                          Single bots
                        </Tab>
                      </Tab.List>
                      <button
                        onClick={handleDeleteAllSessions}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors border border-red-500"
                        title="Delete all sessions in current tab"
                      >
                        Remove All
                      </button>
                    </div>
                    <div className="mb-2 relative">
                      <input
                        type="text"
                        placeholder="Search sessions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 pr-10 text-sm bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>
              </div>
              <Tab.Panels className="flex-grow overflow-hidden mt-2">
                <Tab.Panel className="h-full">
                  <div ref={listRef} className="space-y-1 h-full overflow-y-auto">
                    {/* Start new session option */}
                    <div
                      className={`p-3 rounded cursor-pointer transition-colors ${selectedIndex === -1 && activeTab === 0 ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      onClick={handleStartNewSession}
                    >
                      <div className="flex items-center">
                        <div className="flex-1">
                          <div className="font-medium">Start new session</div>
                          <div className="text-sm opacity-75">Begin a fresh conversation</div>
                        </div>
                        {selectedIndex === -1 && activeTab === 0 && <ChevronDownIcon className="w-5 h-5 ml-2" />}
                      </div>
                    </div>
                    {loading ? (
                      <div className="py-4 text-gray-400">{t('Loading sessions...')}</div>
                    ) : filteredSessions.filter(s => s.type === 'sessionSnapshot').length === 0 ? (
                      <div className="py-4 text-gray-400">{t('No previous sessions found')}</div>
                    ) : (
                      <>
                        {filteredSessions.filter(s => s.type === 'sessionSnapshot').map((s, i) => renderSessionItem(s, i, activeTab === 0 && selectedIndex === i))}
                      </>
                    )}
                  </div>
                </Tab.Panel>
                <Tab.Panel className="h-full">
                  <div ref={listRef} className="space-y-1 h-full overflow-y-auto">
                    {/* Start new session option */}
                    <div
                      className={`p-3 rounded cursor-pointer transition-colors ${selectedIndex === -1 && activeTab === 1 ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      onClick={handleStartNewSession}
                    >
                      <div className="flex items-center">
                        <div className="flex-1">
                          <div className="font-medium">Start new session</div>
                          <div className="text-sm opacity-75">Begin a fresh conversation</div>
                        </div>
                        {selectedIndex === -1 && activeTab === 1 && <ChevronDownIcon className="w-5 h-5 ml-2" />}
                      </div>
                    </div>
                    {loading ? (
                      <div className="py-4 text-gray-400">{t('Loading sessions...')}</div>
                    ) : filteredSessions.filter(s => s.type === 'single').length === 0 ? (
                      <div className="py-4 text-gray-400">{t('No previous sessions found')}</div>
                    ) : (
                      <>
                        {filteredSessions.filter(s => s.type === 'single').map((s, i) => renderSessionItem(s, i, activeTab === 1 && selectedIndex === i))}
                      </>
                    )}
                  </div>
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>

            {/* Load more button - shared between tabs */}
            {((showingTop3 && !isExpanded) || hasMoreSessions) && !loadingMore && (
              <div className="text-center py-4">
                <button
                  onClick={loadMoreSessions}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors border border-blue-500"
                >
                  Load more sessions
                </button>
              </div>
            )}
            {loadingMore && (
              <div className="py-4 text-gray-400 text-center">Loading more sessions...</div>
            )}
            {/* No more sessions indicator */}
            {!hasMoreSessions && !loadingMore && isExpanded && sessions.length > 0 && (
              <div className="text-center py-4">
                <div className="text-sm text-gray-400 mb-2">All sessions loaded</div>
                <div className="text-xs text-gray-500">You've reached the end of your chat history</div>
              </div>
            )}

            <div className="mt-1 text-xs text-white text-center relative">
              {t('Click outside or press Esc to close')}
              {/* Session counter */}
              <div className="absolute right-0 top-0 text-xs text-gray-400">
                {sessions.length}/{allSessionsData.length} sessions
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}

export default SessionRestoreModal
