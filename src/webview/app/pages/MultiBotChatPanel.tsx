import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { sample, uniqBy } from 'lodash-es'
import { FC, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { perfMark } from '~utils/perf'
import { cx, uuid } from '~/utils'
import Browser from 'webextension-polyfill'
import {
  pendingSearchQueryAtom,
  sessionToRestoreAtom,
  allInOneRestoreDataAtom,
  clearAllInOneInputAtom
} from '../state'
import { getSessionSnapshot, loadAllInOneSessions, loadHistoryMessages, setAllInOneSession, saveSessionSnapshot, ChatMessageModel } from '~services/chat-history'
import { updateChatPair, getUserConfig } from '~services/user-config'
import { useSessionNameGenerator } from '~app/hooks/use-session-name'
import AllInOneInputArea from '~app/components/Chat/AllInOneInputArea'
import { BtwStorageContext } from '~app/pages/BtwPage'
import { Layout } from '~app/consts'
import { useChat } from '~app/hooks/use-chat'
import { useSessionRestore } from '~app/hooks/use-session-restore'
import ConversationPanel from '../components/Chat/ConversationPanel'
import {
  allInOnePairsAtom,
  activeAllInOneAtom,
  initializeAllInOneAtom,
  saveAllInOneConfigAtom,
  setActiveAllInOneAtom,
  isInitializingAtom,
  DEFAULT_BOTS,
  DEFAULT_PAIR_CONFIG,
  AllInOnePairConfig,
  currentSessionNameAtom,
} from '~app/atoms/all-in-one'

// ========== Helper Functions ==========

/**
 * レイアウトに応じて必要なパネル数を取得
 */
function getPanelCount(layout: Layout): number {
  switch (layout) {
    case 'single':
      return 1
    case 2:
    case 'twoHorizon':
      return 2
    case 3:
      return 3
    case 4:
      return 4
    case 'sixGrid':
      return 6
    default:
      return 2
  }
}

 /**
 * 有効な（enabled）ボットのインデックスを取得
 */
async function resolveEnabledBotIndices(): Promise<number[]> {
  try {
    perfMark('getUserConfig start')
    const config = await getUserConfig()
    perfMark('getUserConfig done')
    if (!config || !Array.isArray(config.customApiConfigs)) {
      return []
    }
    
    const enabledIndices: number[] = []
    config.customApiConfigs.forEach((customConfig, index) => {
      if (customConfig && customConfig.enabled === true) {
        enabledIndices.push(index)
      }
    })

    return enabledIndices.sort((a, b) => a - b)
  } catch (error) {
    console.error('Failed to resolve enabled bot indices:', error)
    return []
  }
}

/**
 * bots配列を正規化（重複削除、長さ調整）
 */
function normalizeBotsForLayout(
  bots: number[],
  panelCount: number,
  enabledIndices: number[]
): number[] {
  const normalized: number[] = []
  const used = new Set<number>()
  
  // 既存のbotsから重複なく取得
  for (let i = 0; i < bots.length && normalized.length < panelCount; i++) {
    const botIndex = bots[i]
    if (
      typeof botIndex === 'number' &&
      botIndex >= 0 &&
      !used.has(botIndex) &&
      enabledIndices.includes(botIndex)
    ) {
      normalized.push(botIndex)
      used.add(botIndex)
    }
  }
  
  // 不足分をenabledIndicesから補充
  for (const enabledIndex of enabledIndices) {
    if (normalized.length >= panelCount) break
    if (!used.has(enabledIndex)) {
      normalized.push(enabledIndex)
      used.add(enabledIndex)
    }
  }
  
  return normalized
}

/**
 * 選択パネルのモデルを優先して、重複を解消したpanelCount分のbotsを生成
 */
function buildBotsForSelection(
  currentBots: number[],
  panelCount: number,
  enabledIndices: number[],
  selectedIndex: number,
  selectedPanel: number
): number[] | null {
  if (panelCount <= 0 || selectedPanel < 0 || selectedPanel >= panelCount) {
    return null
  }

  const enabledSorted = [...enabledIndices].sort((a, b) => a - b)
  if (enabledSorted.length < panelCount) {
    return null
  }

  const enabledSet = new Set(enabledSorted)
  const result: Array<number | undefined> = new Array(panelCount).fill(undefined)
  const used = new Set<number>()

  result[selectedPanel] = selectedIndex
  used.add(selectedIndex)

  for (let i = 0; i < panelCount; i++) {
    if (i === selectedPanel) continue
    const candidate = currentBots[i]
    if (
      typeof candidate === 'number' &&
      enabledSet.has(candidate) &&
      !used.has(candidate)
    ) {
      result[i] = candidate
      used.add(candidate)
    }
  }

  for (let i = 0; i < panelCount; i++) {
    if (i === selectedPanel) continue
    if (typeof result[i] === 'number') continue
    const next = enabledSorted.find((index) => !used.has(index))
    if (next === undefined) {
      return null
    }
    result[i] = next
    used.add(next)
  }

  return result as number[]
}

function replaceDeprecatedBots(bots: number[]): number[] {
  // インデックスが有効かどうかを確認（0以上の整数であること、undefinedやnullでないこと）
  return bots.map((index) => {
    if (typeof index === 'number' && index >= 0) {
      return index
    }
    // 無効な値の場合はDEFAULT_BOTSからランダムに選択
    return sample(DEFAULT_BOTS) || 0
  })
}

const GeneralChatPanel: FC<{
  chats: ReturnType<typeof useChat>[]
  setBots?: (bots: number[]) => void
  supportImageInput?: boolean
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ chats, setBots, supportImageInput, currentSessionUUID, setCurrentSessionUUID }) => {
  const { t } = useTranslation()
  const isInitializing = useAtomValue(isInitializingAtom)
  const generating = useMemo(() => chats.some((c) => c.generating), [chats])

  useEffect(() => {
    if (chats.length > 0) {
      perfMark('GeneralChatPanel chats ready')
    }
  }, [chats])

  // Btw hint: show after first round of generation completes
  const [showBtwHint, setShowBtwHint] = useState(false)
  const prevGeneratingRef = useRef(false)
  useEffect(() => {
    // Detect generating going from true → false (a round just finished)
    if (prevGeneratingRef.current && !generating) {
      const hasResponses = chats.some((c) => c.messages.length > 0)
      if (hasResponses) {
        setShowBtwHint(true)
      }
    }
    prevGeneratingRef.current = generating
  }, [generating, chats])

  // /Btw feature
  const chatsRef = useRef(chats)
  const currentSessionName = useAtomValue(currentSessionNameAtom)

  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)

  // 入力クリア用（購読しない）
  const clearInput = useSetAtom(clearAllInOneInputAtom)

  // セッション名自動生成フック
  useSessionNameGenerator({
    generating,
    getMessages: () => chats
      .filter(c => c.messages && c.messages.length > 0)
      .map(c => [...c.messages]),
  })
  
  // 現在のペア設定を取得
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG
  const layout = currentPairConfig.layout
  
  // 設定更新関数
  const updateCurrentPairConfig = (updates: Partial<AllInOnePairConfig>) => {
    const newConfig = {
      ...currentPairConfig,
      ...updates
    }

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: newConfig
    }))

    // 設定を保存
    setTimeout(() => saveConfig(), 100)

    // Saved chat pairが存在する場合は自動的に更新（defaultは除外）
    if (activeAllInOne !== 'default' && !activeAllInOne.startsWith('session-')) {
      setTimeout(async () => {
        try {
          // 更新後の設定から現在のボット選択を取得
          let currentBots: number[] = []

          if (newConfig.bots && newConfig.bots.length > 0) {
            const layout = newConfig.layout
            switch (layout) {
              case 'single':
                currentBots = newConfig.bots.slice(0, 1)
                break
              case 2:
              case 'twoHorizon':
                currentBots = newConfig.bots.slice(0, 2)
                break
              case 3:
                currentBots = newConfig.bots.slice(0, 3)
                break
              case 4:
                currentBots = newConfig.bots.slice(0, 4)
                break
              case 'sixGrid':
                currentBots = newConfig.bots.slice(0, 6)
                break
              default:
                currentBots = newConfig.bots.slice(0, 2)
            }
          }

          if (currentBots.length > 0) {
            await updateChatPair(activeAllInOne, { botIndices: currentBots })
          }
        } catch (error) {
          console.error('Failed to auto-update saved chat pair:', error)
        }
      }, 200)
    }
  }
  
  const setLayout = useCallback(async (newLayout: Layout) => {
    // レイアウト変更時にbots配列を正規化
    const newPanelCount = getPanelCount(newLayout)
    const enabledIndices = await resolveEnabledBotIndices()

    if (enabledIndices.length === 0) {
      alert(t('All-in-One: Failed to resolve models'))
      return
    }

    if (enabledIndices.length < newPanelCount) {
      alert(t('All-in-One: Not enough enabled models', { count: newPanelCount }))
      return
    }

    // 現在のbots配列を取得
    const currentBots = currentPairConfig.bots || DEFAULT_BOTS

    // 新しいレイアウトに合わせて正規化
    const normalizedBots = normalizeBotsForLayout(currentBots, newPanelCount, enabledIndices)

    // 全体のbots配列を更新（既存の部分を正規化されたボットで置き換え）
    const updatedAllBots = [...currentBots]
    normalizedBots.forEach((botIndex, i) => {
      updatedAllBots[i] = botIndex
    })

    updateCurrentPairConfig({
      layout: newLayout,
      bots: updatedAllBots
    })
  }, [t, currentPairConfig, updateCurrentPairConfig])
  
  const [refresh, setRefresh] = useState(0) // 更新用の state を追加
  const [pendingSearchQuery, setPendingSearchQuery] = useAtom(pendingSearchQueryAtom)
  
  // 現在のボット選択を取得（共通設定から必要な数だけ取得）
  const getCurrentBotIndices = (): number[] => {
    // 新しい共通bots設定がある場合はそれを使用
    if (currentPairConfig.bots && currentPairConfig.bots.length > 0) {
      const bots = currentPairConfig.bots
      switch (layout) {
        case 'single':
          return bots.slice(0, 1)
        case 2:
        case 'twoHorizon':
          return bots.slice(0, 2)
        case 3:
          return bots.slice(0, 3)
        case 4:
          return bots.slice(0, 4)
        case 'sixGrid':
          return bots.slice(0, 6)
        default:
          return bots.slice(0, 2)
      }
    }

    // 後方互換性：古い設定形式の場合
    switch (layout) {
      case 'single':
        return currentPairConfig.singlePanelBots || DEFAULT_BOTS.slice(0, 1)
      case 2:
      case 'twoHorizon':
        return currentPairConfig.twoPanelBots || DEFAULT_BOTS.slice(0, 2)
      case 3:
        return currentPairConfig.threePanelBots || DEFAULT_BOTS.slice(0, 3)
      case 4:
        return currentPairConfig.fourPanelBots || DEFAULT_BOTS.slice(0, 4)
      case 'sixGrid':
        return currentPairConfig.sixPanelBots || DEFAULT_BOTS.slice(0, 6)
      default:
        return currentPairConfig.twoPanelBots || DEFAULT_BOTS.slice(0, 2)
    }
  }

  // リサイズ機能のstate
  const [gridAreaHeight, setGridAreaHeight] = useState('99%') // 初期状態では入力エリアを小さく
  const [isResizing, setIsResizing] = useState(false)
  const [hasUserResized, setHasUserResized] = useState(false) // ユーザーがリサイズしたかどうか
  
  // refs
  const mainContainerRef = useRef<HTMLDivElement>(null)
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const resizerRef = useRef<HTMLDivElement>(null)

  // 共通の高さ設定関数
  const updateGridAreaHeight = useCallback((newGridAreaHeight: number) => {
    if (!mainContainerRef.current) return
    
    const containerHeight = mainContainerRef.current.getBoundingClientRect().height
    const heightPercentage = (newGridAreaHeight / containerHeight) * 100
    const clampedPercentage = Math.max(10, Math.min(95, heightPercentage))
    
    setGridAreaHeight(`${clampedPercentage}%`)
  }, [])

  // マウスイベントハンドラー
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !mainContainerRef.current) return
    
    const containerRect = mainContainerRef.current.getBoundingClientRect()
    const containerHeight = containerRect.height
    const mouseY = e.clientY - containerRect.top
    
    // 高さの制約
    const minHeight = 100 // チャットエリアの最小高さ（固定100px）
    const maxHeight = containerHeight - 60 // 入力エリアが最低60px確保できるよう
    const clampedHeight = Math.max(minHeight, Math.min(maxHeight, mouseY))
    
    updateGridAreaHeight(clampedHeight)
    setHasUserResized(true) // ユーザーがリサイズしたことを記録
  }, [isResizing, updateGridAreaHeight])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  // 自動拡大時の高さ変化ハンドラー
  const handleAutoHeightChange = useCallback((textareaHeight: number) => {
    if (hasUserResized || !mainContainerRef.current) return
    
    // TextAreaの高さに基づいて入力エリア全体の必要な高さを計算
    const containerHeight = mainContainerRef.current.getBoundingClientRect().height
    const inputAreaPadding = 32 // px-4 py-2 + その他のパディング
    const neededInputAreaHeight = textareaHeight + inputAreaPadding
    
    // グリッドエリアの高さを調整（共通関数を使用）
    const newGridAreaHeight = Math.max(100, containerHeight - neededInputAreaHeight)
    updateGridAreaHeight(newGridAreaHeight)
  }, [hasUserResized, updateGridAreaHeight])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  useEffect(() => {
  }, [chats.length, supportImageInput])

  const sendSingleMessage = useCallback(
   (input: string, index: number, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => {
     const chat = chats.find((c) => c.index === index);
     if (chat) {
       chat.sendMessage(input, images, attachments, audioFiles, videoFiles, pdfFiles);
     }
   },
   [chats],
 );

  // chatsをrefで更新して、sendAllMessageを安定化
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  const sendAllMessage = useCallback(
    (input: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => {
      if (!input?.trim() && !images?.length && !attachments?.length && !audioFiles?.length && !videoFiles?.length && !pdfFiles?.length) return;

      // まずメッセージを送信（refから最新のchatsを取得）
      uniqBy(chatsRef.current, (c) => c.index).forEach((c) => c.sendMessage(input, images, attachments, audioFiles, videoFiles, pdfFiles));

      // 送信後に入力をクリア
      clearInput();
    },
    [clearInput],
  )

  // /btw コマンドを処理する — context を storage に保存してポップアップウィンドウを開く
  const handleBtwCommand = useCallback(async (query: string) => {
    const ctx: BtwStorageContext = {
      query,
      chats: chatsRef.current.map((c) => ({
        index: c.index,
        messages: c.messages.map((m) => ({ author: m.author, text: m.text || '' })),
      })),
      sessionName: currentSessionName || undefined,
    }
    await Browser.storage.session.set({ btwContext: ctx })
    await Browser.windows.create({
      url: Browser.runtime.getURL('app.html#/btw'),
      type: 'popup',
      width: 840,
      height: 680,
      focused: true,
    })
    clearInput()
  }, [clearInput, currentSessionName])

  // 生成完了時にセッション保存
  useEffect(() => {
    // すべてのチャットの生成が完了している場合にセッションを保存
    if (chats.length > 0 && !generating && chats.some(chat => chat.messages.length > 0)) {
      const currentBots = getCurrentBotIndices();
      const pairName = currentPairConfig.pairName || `All-in-One ${currentBots.length} bots`;

      // 既存のセッションUUIDがあればそれを使用、なければ新しいUUIDを生成
      const sessionUUID = currentSessionUUID || `session-${uuid()}`;

      // 新しいUUIDを生成した場合は保存
      if (!currentSessionUUID && setCurrentSessionUUID) {
        setCurrentSessionUUID(sessionUUID);
      }

      // 各チャットの現在のメッセージを取得
      const currentMessages: { [botIndex: number]: ChatMessageModel[] } = {};
      uniqBy(chats, (c) => c.index).forEach((chat) => {
        if (chat.messages.length > 0) {
          currentMessages[chat.index] = [...chat.messages];
        }
      });

      // メッセージがある場合のみ保存
      if (Object.keys(currentMessages).length > 0) {
        saveSessionSnapshot(sessionUUID, currentBots, layout.toString(), pairName, currentMessages);
      }
    }
  }, [generating, chats, getCurrentBotIndices, currentPairConfig, layout, currentSessionUUID])


  // 保存された検索クエリがあれば自動的に送信
  useEffect(() => {
    // chats配列内のすべてのchatオブジェクトが準備完了しているか確認
    // AsyncAbstractBotの場合、初期化が完了していることを確認
    const allChatsReady = chats.length > 0 && chats.every(chat => {
      if (!chat || !chat.bot) return false;
      // chatオブジェクトのisInitializedプロパティを確認
      return chat.isInitialized;
    });
    if (pendingSearchQuery && !generating && allChatsReady) {
      sendAllMessage(pendingSearchQuery)
      
      setPendingSearchQuery(null)
    }
  }, [pendingSearchQuery, generating, chats, sendAllMessage, setPendingSearchQuery])

  const modifyAllLastMessage = async(text: string) => {
    uniqBy(chats, (c) => c.index).forEach((c) => c.modifyLastMessage(text))
  }

  const onSwitchBot = useCallback(
    async (newIndex: number, arrayIndex: number) => {
      if (!setBots) {
        return
      }

      // 有効なボットのインデックスを取得
      const enabledIndices = await resolveEnabledBotIndices()
      if (enabledIndices.length === 0) {
        alert(t('All-in-One: Failed to resolve models'))
        return
      }

      // 選択されたボットが有効か確認
      if (!enabledIndices.includes(newIndex)) {
        alert(t('All-in-One: Failed to resolve models'))
        return
      }

      // 現在のレイアウトに基づいて必要なボット数を取得
      const panelCount = getPanelCount(layout)
      
      // 必要なボット数が有効なボット数を超えていないか確認
      if (enabledIndices.length < panelCount) {
        alert(t('All-in-One: Not enough enabled models', { count: panelCount }))
        return
      }

      // 共通のbots配列を取得
      const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS

      const currentBots = currentAllBots.slice(0, panelCount)
      const updatedPanelBots = buildBotsForSelection(
        currentBots,
        panelCount,
        enabledIndices,
        newIndex,
        arrayIndex
      )

      if (!updatedPanelBots) {
        alert(t('All-in-One: Not enough enabled models', { count: panelCount }))
        return
      }

      const newAllBots = [...currentAllBots]
      updatedPanelBots.forEach((botIndex, i) => {
        newAllBots[i] = botIndex
      })

      // 共通設定を更新
      updateCurrentPairConfig({ bots: newAllBots })

      // 各パネルから渡されたsetBots関数を使用（後方互換性のため）
      setBots(updatedPanelBots)

      // refreshを更新して再レンダリングを促す
      setRefresh(prev => prev + 1)
    },
    [t, chats, setBots, setRefresh, currentPairConfig, updateCurrentPairConfig, layout],
  )

  const onLayoutChange = useCallback(
    async (v: Layout) => {
      await setLayout(v)
    },
    [setLayout],
  )

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Inner container */}
      <div ref={mainContainerRef} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* チャットパネルのグリッドエリア */}
        <div
          ref={gridAreaRef}
          style={{ height: gridAreaHeight }}
        className={cx(
          isInitializing && "invisible",
          layout === 'twoHorizon'
            ? 'flex flex-col'
            : 'grid auto-rows-fr',
          'overflow-hidden',
          chats.length === 1
            ? 'grid-cols-1'
            : chats.length % 3 === 0 ? 'grid-cols-3' : 'grid-cols-2',
          'gap-1 mb-1',
        )}
      >
        {chats.map((chat, index) => (
          <ConversationPanel
            key={`${chat.index}-${index}-${refresh}`}
            index={chat.index}
            bot={chat.bot}
            messages={chat.messages}
            onUserSendMessage={(input, images, attachments, audioFiles, videoFiles, pdfFiles) => sendSingleMessage(input, chat.index, images, attachments, audioFiles, videoFiles, pdfFiles)}
            generating={chat.generating}
            stopGenerating={chat.stopGenerating}
            mode="compact"
            resetConversation={chat.resetConversation}
            onSwitchBot={setBots ? (newIndex) => onSwitchBot(newIndex, index) : undefined}
            onPropaganda={modifyAllLastMessage}
            onRetry={chat.retryMessage}
            shouldAutoScroll={chat.shouldAutoScroll}
            setAutoScroll={chat.setAutoScroll}
          />
        ))}
      </div>

      {/* リサイズハンドル（透明、判定エリア拡大） */}
      <div className="relative w-full h-px shrink-0 bg-transparent">
        <div
          ref={resizerRef}
          className="absolute inset-x-0 -top-2 -bottom-2 cursor-row-resize"
          onMouseDown={(e) => {
            setIsResizing(true)
            e.preventDefault()
          }}
        />
      </div>

      {/* 入力エリア */}
      <AllInOneInputArea
        layout={layout}
        generating={generating}
        supportImageInput={supportImageInput}
        hasUserResized={hasUserResized}
        showBtwHint={showBtwHint}
        onLayoutChange={onLayoutChange}
        onSubmit={sendAllMessage}
        onHeightChange={handleAutoHeightChange}
        onBtwCommand={handleBtwCommand}
      />
      </div>
    </div>
  )
}

const SingleBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  // 共通bots設定から最初の1つを取得、または後方互換性のため古い設定を使用
  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 1)
    : (currentPairConfig.singlePanelBots || DEFAULT_BOTS.slice(0, 1))

  const setBots = (newBots: number[]) => {
    // 共通設定を更新（後方互換性のため両方更新）
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        singlePanelBots: newBots // 後方互換性
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  // 配列が空または最初の要素がundefinedの場合の追加チェック
  const safeIndex = multiPanelBotIndices[0] ?? 0
  const chat = useChat(safeIndex)

  const chats = useMemo(() => [chat], [chat])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}

const TwoBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 2)
    : (currentPairConfig.twoPanelBots || DEFAULT_BOTS.slice(0, 2))

  const setBots = (newBots: number[]) => {
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        twoPanelBots: newBots
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  const chat1 = useChat(multiPanelBotIndices[0] ?? 0)
  const chat2 = useChat(multiPanelBotIndices[1] ?? 1)

  const chats = useMemo(() => [chat1, chat2], [chat1, chat2])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}

const TwoHorizonBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 2)
    : (currentPairConfig.twoPanelBots || DEFAULT_BOTS.slice(0, 2))

  const setBots = (newBots: number[]) => {
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        twoPanelBots: newBots
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  const chat1 = useChat(multiPanelBotIndices[0] ?? 0)
  const chat2 = useChat(multiPanelBotIndices[1] ?? 1)

  const chats = useMemo(() => [chat1, chat2], [chat1, chat2])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}

const ThreeBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 3)
    : (currentPairConfig.threePanelBots || DEFAULT_BOTS.slice(0, 3))

  const setBots = (newBots: number[]) => {
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        threePanelBots: newBots
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  const chat1 = useChat(multiPanelBotIndices[0] ?? 0)
  const chat2 = useChat(multiPanelBotIndices[1] ?? 1)
  const chat3 = useChat(multiPanelBotIndices[2] ?? 2)

  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}

const FourBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 4)
    : (currentPairConfig.fourPanelBots || DEFAULT_BOTS.slice(0, 4))

  const setBots = (newBots: number[]) => {
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        fourPanelBots: newBots
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  const chat1 = useChat(multiPanelBotIndices[0] ?? 0)
  const chat2 = useChat(multiPanelBotIndices[1] ?? 1)
  const chat3 = useChat(multiPanelBotIndices[2] ?? 2)
  const chat4 = useChat(multiPanelBotIndices[3] ?? 3)

  const chats = useMemo(() => [chat1, chat2, chat3, chat4], [chat1, chat2, chat3, chat4])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}

const SixBotChatPanel: FC<{
  currentSessionUUID?: string | null
  setCurrentSessionUUID?: (uuid: string | null) => void
}> = ({ currentSessionUUID, setCurrentSessionUUID }) => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG

  const bots = currentPairConfig.bots
    ? currentPairConfig.bots.slice(0, 6)
    : (currentPairConfig.sixPanelBots || DEFAULT_BOTS.slice(0, 6))

  const setBots = (newBots: number[]) => {
    const currentAllBots = currentPairConfig.bots || DEFAULT_BOTS
    const updatedAllBots = [...currentAllBots]
    newBots.forEach((bot, index) => {
      if (index < updatedAllBots.length) {
        updatedAllBots[index] = bot
      }
    })

    setAllInOnePairs(prev => ({
      ...prev,
      [activeAllInOne]: {
        ...currentPairConfig,
        bots: updatedAllBots,
        sixPanelBots: newBots
      }
    }))
    setTimeout(() => saveConfig(), 100)
  }

  const multiPanelBotIndices = useMemo(() => replaceDeprecatedBots(bots), [bots])

  const chat1 = useChat(multiPanelBotIndices[0] ?? 0)
  const chat2 = useChat(multiPanelBotIndices[1] ?? 1)
  const chat3 = useChat(multiPanelBotIndices[2] ?? 2)
  const chat4 = useChat(multiPanelBotIndices[3] ?? 3)
  const chat5 = useChat(multiPanelBotIndices[4] ?? 4)
  const chat6 = useChat(multiPanelBotIndices[5] ?? 5)

  const chats = useMemo(() => [chat1, chat2, chat3, chat4, chat5, chat6], [chat1, chat2, chat3, chat4, chat5, chat6])

  return <GeneralChatPanel
    chats={chats}
    setBots={setBots}
    supportImageInput={true}
    currentSessionUUID={currentSessionUUID}
    setCurrentSessionUUID={setCurrentSessionUUID}
  />
}


const MultiBotChatPanel: FC = () => {
  const [activeAllInOne] = useAtom(activeAllInOneAtom)
  const [allInOnePairs, setAllInOnePairs] = useAtom(allInOnePairsAtom)
  const initializeConfig = useSetAtom(initializeAllInOneAtom)
  const persistActivePair = useSetAtom(setActiveAllInOneAtom)
  const saveConfig = useSetAtom(saveAllInOneConfigAtom)
  const currentPairConfig = allInOnePairs[activeAllInOne] || DEFAULT_PAIR_CONFIG
  const layout = currentPairConfig.layout
  const { t } = useTranslation()
  const sessionToRestore = useAtomValue(sessionToRestoreAtom)
  const setSessionToRestore = useSetAtom(sessionToRestoreAtom)
  const setAllInOneRestoreData = useSetAtom(allInOneRestoreDataAtom)

  const [currentSessionUUID, setCurrentSessionUUID] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useAtom(isInitializingAtom)

  // 初期化（前回の設定を復旧）
  useEffect(() => {
    perfMark('MultiBotChatPanel mount')
    initializeConfig().then(() => {
      perfMark('initializeConfig complete')
      setIsInitializing(false)
    })
  }, [])


  // pair URL パラメータ経由のペア選択（初期化完了後に処理）
  useEffect(() => {
    if (isInitializing) return

    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return

    const params = new URLSearchParams(hash.substring(queryStart + 1))
    const pairId = params.get('pair')
    if (!pairId) return

    // 存在するペアIDのみ切り替え。存在しない場合は無視（defaultのまま）
    if (allInOnePairs[pairId]) {
      persistActivePair(pairId)
    }
  }, [isInitializing])


  // URL パラメータ経由のセッション復元（新規タブ復元用）
  useEffect(() => {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return

    const params = new URLSearchParams(hash.substring(queryStart + 1))
    const restoreSessionUUID = params.get('restoreSessionUUID')
    if (!restoreSessionUUID) return

    const clearUrlParams = () => {
      const newHash = hash.substring(0, queryStart)
      window.history.replaceState({}, '', window.location.pathname + newHash)
    }

    ;(async () => {
      try {
        const snapshot = await getSessionSnapshot(restoreSessionUUID)
        if (!snapshot) {
          alert(`${t('Restore Session')}: ${t('Failed to restore session.')}`)
          // 不正なUUIDは消す（F5ループ防止）
          clearUrlParams()
          return
        }

        setSessionToRestore({
          type: 'sessionSnapshot',
          sessionUUID: snapshot.sessionUUID,
          botIndices: snapshot.botIndices,
          layout: snapshot.layout,
          pairName: snapshot.pairName,
          snapshotMessages: snapshot.conversations,
        })
        // 成功時はURLを残す（リロード/共有/ブックマークで再復元）
      } catch (error) {
        alert(`${t('Restore Session')}: ${t('Failed to restore session.')}`)
        clearUrlParams()
      }
    })()
  }, [setSessionToRestore, t])

  // URL パラメータ経由のレガシー All-In-One セッション復元
  useEffect(() => {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return

    const params = new URLSearchParams(hash.substring(queryStart + 1))
    const restoreAllInOneSessionId = params.get('restoreAllInOneSessionId')
    if (!restoreAllInOneSessionId) return

    const clearUrlParams = () => {
      const newHash = hash.substring(0, queryStart)
      window.history.replaceState({}, '', window.location.pathname + newHash)
    }

    ;(async () => {
      try {
        const sessions = await loadAllInOneSessions()
        const session = sessions.find(s => s.id === restoreAllInOneSessionId)
        if (!session) {
          alert(`${t('Restore Session')}: ${t('Failed to restore session.')}`)
          // 不正なIDは消す（F5ループ防止）
          clearUrlParams()
          return
        }

        setSessionToRestore({
          type: 'allInOne',
          sessionId: session.id,
          botIndices: session.botIndices,
          layout: session.layout,
          pairName: session.pairName,
          conversations: session.conversations,
        })
        // 成功時はURLを残す（リロード/共有/ブックマークで再復元）
      } catch (error) {
        alert(`${t('Restore Session')}: ${t('Failed to restore session.')}`)
        clearUrlParams()
      }
    })()
  }, [setSessionToRestore, t])

  // Use session restore hook
  useSessionRestore({
    sessionToRestore,
    activeAllInOne,
    setAllInOnePairs,
    setAllInOneRestoreData,
    setCurrentSessionUUID,
    setSessionToRestore,
  })

  if (layout === 'sixGrid') {
    return <SixBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
  }
  if (layout === 4) {
    return <FourBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
  }
  if (layout === 3) {
    return <ThreeBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
  }
  if (layout === 'twoHorizon') {
    return <TwoHorizonBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
  }
  if (layout === 'single') {
    return <SingleBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
  }
  return <TwoBotChatPanel currentSessionUUID={currentSessionUUID} setCurrentSessionUUID={setCurrentSessionUUID} />
}

const MultiBotChatPanelPage: FC = () => {
  return (
    <Suspense>
      <MultiBotChatPanel />
    </Suspense>
  )
}

export default MultiBotChatPanelPage
