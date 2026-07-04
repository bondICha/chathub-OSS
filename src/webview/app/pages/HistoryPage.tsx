import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import Browser from 'webextension-polyfill'
import { useTranslation } from 'react-i18next'
import { ViewportList } from 'react-viewport-list'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import PagePanel from '~app/components/Page'
import SessionCard from '~app/components/History/SessionCard'
import SearchInput from '~app/components/History/SearchInput'
import RestoreWarningModal from '~app/components/History/RestoreWarningModal'
import { MigrationProgress } from '~app/components/MigrationProgress'
import {
  loadSnapshotMetas,
  loadAioMetas,
  loadSingleMetas,
  getSessionPreview,
  loadHistoryMessages,
  setConversationMessages,
  getSessionSnapshot,
  loadAllInOneSessions,
} from '~services/chat-history'
import { getUserConfig } from '~services/user-config'
import { cx, uuid } from '~utils'
import type { ActiveTab, AnyMeta, RestoreWarning, SessionListItem } from './HistoryPage/types'
import { buildSessionMarkdown, buildSessionJSON, downloadBlob } from './HistoryPage/format'
import { useDeepSearch } from './HistoryPage/useDeepSearch'

const HistoryPage: FC = () => {
  const { t } = useTranslation()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState<ActiveTab>('allInOne')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [restoreWarning, setRestoreWarning] = useState<RestoreWarning | null>(null)
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)

  const [loadingSessions, setLoadingSessions] = useState(false)
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  // sessionKey → 本文取得用メタ。deep search で使う。
  const metaMapRef = useRef<Map<string, AnyMeta>>(new Map())

  const [sessionSearch, setSessionSearch] = useState('')
  const [sessionVisibleCount, setSessionVisibleCount] = useState(10)
  const sessionCardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const sessionListRef = useRef<HTMLDivElement | null>(null)

  // プレビュー遅延ロード用state
  const [previewMap, setPreviewMap] = useState<Map<string, { firstMessage?: string; botResponses?: { botName: string; response: string; botIcon?: string }[] }>>(new Map())

  // セッション再読込/タブ切替で deep search キャッシュをリセットするためのキー
  const [searchResetKey, setSearchResetKey] = useState(0)

  const clearHashQuery = useCallback(() => {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return
    const newHash = hash.substring(0, queryStart)
    window.history.replaceState({}, '', window.location.pathname + newHash)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return

    const params = new URLSearchParams(hash.substring(queryStart + 1))
    const tab = params.get('tab')
    if (tab === 'individual') {
      setActiveTab('individual')
      clearHashQuery()
      return
    }
    if (tab === 'allInOne') {
      setActiveTab('allInOne')
      clearHashQuery()
      return
    }
    const idx = params.get('botIndex')
    if (idx && /^\d+$/.test(idx)) clearHashQuery()
  }, [location.hash, location.search])

  const loadSessionsData = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const config = await getUserConfig()
      const botCount = (config.customApiConfigs || []).length
      const botNames = (config.customApiConfigs || []).map((c, i) => c.name || `Bot ${i + 1}`)
      const botIcons = (config.customApiConfigs || []).map((c) => c.avatar || '')

      const [snapMetas, aioMetas, singleMetas] = await Promise.all([
        loadSnapshotMetas(),
        loadAioMetas(),
        loadSingleMetas(Math.max(botCount, 10)),
      ])

      // AIO が参照している per-bot conversation を single 側から除外（メタ完結の dedup）
      const aioOwnedConvs = new Set<string>()
      for (const m of aioMetas) {
        const snaps = m.conversationSnapshots
        if (!snaps) continue
        for (const botIndex of Object.keys(snaps)) {
          aioOwnedConvs.add(`${botIndex}:${snaps[Number(botIndex)]}`)
        }
      }

      const metaMap = new Map<string, AnyMeta>()
      const all: SessionListItem[] = []

      for (const m of snapMetas) {
        const sessionKey = `snap:${m.sessionUUID}`
        metaMap.set(sessionKey, m)
        const sessionBotNames = m.botIndices.map((idx) => botNames[idx] || `Bot ${idx + 1}`)
        const sessionBotIcons = m.botIndices.map((idx) => botIcons[idx] || '')
        const searchString = [
          sessionBotNames.join(' '),
          m.searchPreview,
          m.pairName || '',
        ].join(' ').toLowerCase()
        all.push({
          type: 'sessionSnapshot',
          sessionUUID: m.sessionUUID,
          createdAt: m.createdAt ?? m.lastUpdated,
          lastUpdated: m.lastUpdated,
          messageCount: m.messageCount,
          botIndices: m.botIndices,
          layout: m.layout || '',
          pairName: m.pairName,
          firstMessage: m.searchPreview || undefined,
          botNames: sessionBotNames,
          botIcons: sessionBotIcons,
          _sessionKey: sessionKey,
          _searchString: searchString,
        })
      }

      for (const m of aioMetas) {
        const sessionKey = `aio:${m.sessionId}`
        metaMap.set(sessionKey, m)
        const sessionBotNames = m.botIndices.map((idx) => botNames[idx] || `Bot ${idx + 1}`)
        const sessionBotIcons = m.botIndices.map((idx) => botIcons[idx] || '')
        const searchString = [
          sessionBotNames.join(' '),
          m.searchPreview,
          m.pairName || '',
        ].join(' ').toLowerCase()
        all.push({
          type: 'allInOneLegacy',
          sessionId: m.sessionId,
          createdAt: m.createdAt,
          lastUpdated: m.lastUpdated,
          messageCount: m.messageCount,
          botIndices: m.botIndices,
          layout: m.layout,
          pairName: m.pairName,
          firstMessage: m.searchPreview || undefined,
          botNames: sessionBotNames,
          botIcons: sessionBotIcons,
          _sessionKey: sessionKey,
          _searchString: searchString,
        })
      }

      for (const m of singleMetas) {
        const dedupKey = `${m.botIndex}:${m.conversationId}`
        if (aioOwnedConvs.has(dedupKey)) continue
        const sessionKey = `single:${m.botIndex}:${m.conversationId}`
        metaMap.set(sessionKey, m)
        const botName = botNames[m.botIndex] || `Bot ${m.botIndex + 1}`
        const botIcon = botIcons[m.botIndex] || ''
        all.push({
          type: 'single',
          botIndex: m.botIndex,
          conversationId: m.conversationId,
          createdAt: m.createdAt,
          lastUpdated: m.createdAt,
          messageCount: 0,
          botNames: [botName],
          botIcons: [botIcon],
          _sessionKey: sessionKey,
          _searchString: botName.toLowerCase(),
        })
      }

      all.sort((a, b) => b.lastUpdated - a.lastUpdated)
      metaMapRef.current = metaMap
      // Deep search キャッシュは sessions が変わるとリセットすべき
      setSearchResetKey((k) => k + 1)
      setSessions(all)
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    loadSessionsData()
  }, [loadSessionsData])

  useEffect(() => {
    setSessionVisibleCount(50)
    setSelectedSessionKey(null)
  }, [activeTab, sessionSearch])

  // タブ切り替え時は deep search キャッシュをクリア（古いタブの結果が残らないように）
  useEffect(() => {
    setSearchResetKey((k) => k + 1)
  }, [activeTab])

  useEffect(() => {
    if (!selectedSessionKey) return
    const target = sessionCardRefs.current.get(selectedSessionKey)
    if (!target) return
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [selectedSessionKey])

  const baseSessionsByTab = useMemo(() => {
    const allInOne = sessions.filter((s) => s.type === 'sessionSnapshot' || s.type === 'allInOneLegacy')
    const individual = sessions.filter((s) => s.type === 'single')
    return activeTab === 'allInOne' ? allInOne : individual
  }, [activeTab, sessions])

  // Deep search はフックに委譲（本文を遅延ロード+チャンク走査+デバウンス+キャッシュ）
  const getMeta = useCallback((sessionKey: string) => metaMapRef.current.get(sessionKey), [])
  const { deepMatches, searchProgress } = useDeepSearch({
    query: sessionSearch,
    baseItems: baseSessionsByTab,
    getMeta,
    resetKey: searchResetKey,
  })

  // 検索: 即時はプレビュー一致のみ、deep search の結果は届き次第合流
  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return baseSessionsByTab
    const deep = deepMatches.get(q)
    return baseSessionsByTab.filter((s) => {
      if (s._searchString.includes(q)) return true
      if (deep && deep.has(s._sessionKey)) return true
      return false
    })
  }, [baseSessionsByTab, sessionSearch, deepMatches])

  const visibleSessions = useMemo(() => {
    return filteredSessions.slice(0, sessionVisibleCount)
  }, [filteredSessions, sessionVisibleCount])

  const canLoadMoreSessions = useMemo(() => {
    if (loadingSessions) return false
    return sessionVisibleCount < filteredSessions.length
  }, [filteredSessions.length, loadingSessions, sessionVisibleCount])

  const sessionStatsText = useMemo(() => {
    return t('History sessions stats', {
      loaded: baseSessionsByTab.length,
      matched: filteredSessions.length,
      shown: visibleSessions.length,
    })
  }, [baseSessionsByTab.length, filteredSessions.length, t, visibleSessions.length])

  const searchProgressText = useMemo(() => {
    if (!searchProgress) return ''
    return t('Deep searching... ({{scanned}}/{{total}})', searchProgress) as string
  }, [searchProgress, t])

  // プレビューロード進捗（previewMap から派生、独立 state 不要）
  const previewProgressText = useMemo(() => {
    const total = visibleSessions.length
    if (total === 0) return ''
    const loaded = visibleSessions.reduce((n, s) => (previewMap.has(s._sessionKey) ? n + 1 : n), 0)
    if (loaded >= total) return ''
    return t('Loading previews... ({{loaded}}/{{total}})', { loaded, total }) as string
  }, [visibleSessions, previewMap, t])

  const loadMoreSessions = useCallback(
    (count: number) => {
      setSessionVisibleCount((prev) => Math.min(prev + count, filteredSessions.length))
    },
    [filteredSessions.length],
  )

  // プレビュー遅延ロード: 新しいセッションが可視化されたらバックグラウンドで取得
  useEffect(() => {
    const itemsToPreview = visibleSessions.filter((s) => !previewMap.has(s._sessionKey))
    if (itemsToPreview.length === 0) return

    const loadPreviews = async () => {
      const config = await getUserConfig()
      const botNames = (config.customApiConfigs || []).map((c, i) => c.name || `Bot ${i + 1}`)
      const botIcons = (config.customApiConfigs || []).map((c) => c.avatar || '')

      for (const item of itemsToPreview) {
        const meta = metaMapRef.current.get(item._sessionKey)
        if (!meta) {
          // メタが無い場合も「処理済み」マーカーを残す（進捗カウントから外す）
          setPreviewMap((prev) => new Map(prev).set(item._sessionKey, {}))
          continue
        }

        try {
          const preview = await getSessionPreview(meta, botNames, botIcons)
          setPreviewMap((prev) => new Map(prev).set(item._sessionKey, preview))
        } catch (e) {
          // 失敗時も「処理済み」マーカーを残す
          setPreviewMap((prev) => new Map(prev).set(item._sessionKey, {}))
        }
      }
    }
    loadPreviews()
  }, [visibleSessions, previewMap])

  // visibleSessions に previewMap をマージしたデータを返す
  const sessionsWithPreview = useMemo(() => {
    return visibleSessions.map((s) => {
      const preview = previewMap.get(s._sessionKey)
      if (!preview) return s
      return {
        ...s,
        firstMessage: preview.firstMessage ?? s.firstMessage,
        botResponses: preview.botResponses ?? s.botResponses,
      }
    })
  }, [visibleSessions, previewMap])

  const openAppTab = useCallback(async (hashPath: string) => {
    const url = `${Browser.runtime.getURL('app.html')}${hashPath}`
    await Browser.tabs.create({ url })
  }, [])

  const doRestoreSession = useCallback(
    async (item: SessionListItem) => {
      if (item.type === 'sessionSnapshot') {
        await openAppTab(`#/?restoreSessionUUID=${encodeURIComponent(item.sessionUUID)}`)
        return
      }
      if (item.type === 'allInOneLegacy') {
        await openAppTab(`#/?restoreAllInOneSessionId=${encodeURIComponent(item.sessionId)}`)
        return
      }
      await openAppTab(
        `#/chat/custom/${item.botIndex}?restoreConversationId=${encodeURIComponent(item.conversationId)}`,
      )
    },
    [openAppTab],
  )

  const restoreSession = useCallback(
    async (item: SessionListItem) => {
      const config = await getUserConfig()
      const allBots = config.customApiConfigs || []
      const availableBots = allBots
        .map((b, i) => ({ index: i, name: b.name || `Bot ${i + 1}` }))
        .filter((_, i) => allBots[i]?.enabled === true)

      const botIndicesToCheck =
        item.type === 'single' ? [item.botIndex] : item.botIndices ?? []

      const missingBotIndices = botIndicesToCheck.filter(
        (bi) => !allBots[bi] || allBots[bi].enabled !== true,
      )

      if (missingBotIndices.length > 0) {
        const missingBotNames = missingBotIndices.map(
          (bi) => allBots[bi]?.name || `Bot ${bi + 1}`,
        )
        setRestoreWarning({
          type: item.type === 'single' ? 'individual_bot_missing' : 'aio_bots_missing',
          item,
          missingBotIndices,
          missingBotNames,
          availableBots,
        })
        return
      }

      await doRestoreSession(item)
    },
    [doRestoreSession],
  )

  const handleRestoreWarningContinue = useCallback(
    async (warning: RestoreWarning, selectedBotIndex?: number) => {
      setRestoreWarning(null)

      if (warning.type === 'individual_bot_missing' && selectedBotIndex !== undefined) {
        // 別ボットで続行: 旧ボットの会話を読み込み、新ボットのストレージにコピーして復元
        const item = warning.item as SessionListItem & { type: 'single'; botIndex: number; conversationId: string }
        const conversations = await loadHistoryMessages(item.botIndex)
        const conv = conversations.find((c) => c.id === item.conversationId)
        if (!conv || conv.messages.length === 0) {
          // メッセージが見つからない場合は新ボットへ素直に遷移
          await openAppTab(`#/chat/custom/${selectedBotIndex}`)
          return
        }
        const newConvId = `from-bot${item.botIndex}-${uuid()}`
        await setConversationMessages(selectedBotIndex, newConvId, conv.messages)
        await openAppTab(
          `#/chat/custom/${selectedBotIndex}?restoreConversationId=${encodeURIComponent(newConvId)}`,
        )
        return
      }

      // AIO: 有効なボットのみで続行（URL経由でリストア、MultiBotChatPanel側でフィルタリング）
      await doRestoreSession(warning.item)
    },
    [doRestoreSession, openAppTab],
  )

  const handleCopySession = useCallback(async (item: SessionListItem) => {
    setActionLoadingKey(item._sessionKey)
    try {
      const markdown = await buildSessionMarkdown(item)
      if (!markdown) {
        toast.error(t('No content to copy.'))
        return
      }
      await navigator.clipboard.writeText(markdown)
      toast.success(t('Copied!'))
    } catch {
      toast.error(t('Copy failed.'))
    } finally {
      setActionLoadingKey(null)
    }
  }, [t])

  const handleCopyConversation = useCallback(async (warning: RestoreWarning) => {
    await handleCopySession(warning.item)
  }, [handleCopySession])

  const makeFileName = useCallback((item: SessionListItem, ext: string) => {
    const date = dayjs(item.lastUpdated).format('YYYYMMDD-HHmm')
    const name = (item.type !== 'single' ? item.pairName : '') || item.botNames?.join('_') || 'session'
    const safe = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 40)
    return `${safe}_${date}.${ext}`
  }, [])

  const handleDownloadMd = useCallback(async (item: SessionListItem) => {
    setActionLoadingKey(item._sessionKey)
    try {
      const markdown = await buildSessionMarkdown(item)
      if (!markdown) {
        toast.error(t('No content to download.'))
        return
      }
      downloadBlob(new Blob([markdown], { type: 'text/markdown' }), makeFileName(item, 'md'))
    } catch {
      toast.error(t('Download failed.'))
    } finally {
      setActionLoadingKey(null)
    }
  }, [makeFileName, t])

  const handleDownloadJson = useCallback(async (item: SessionListItem) => {
    setActionLoadingKey(item._sessionKey)
    try {
      const json = await buildSessionJSON(item)
      if (!json) {
        toast.error(t('No content to download.'))
        return
      }
      downloadBlob(new Blob([json], { type: 'application/json' }), makeFileName(item, 'json'))
    } catch {
      toast.error(t('Download failed.'))
    } finally {
      setActionLoadingKey(null)
    }
  }, [makeFileName, t])

  return (
    <PagePanel title={t('View history') as string}>
      {restoreWarning && (
        <RestoreWarningModal
          warning={restoreWarning}
          onContinue={handleRestoreWarningContinue}
          onCopyConversation={handleCopyConversation}
          copyLoading={actionLoadingKey !== null}
          onClose={() => setRestoreWarning(null)}
        />
      )}
      <MigrationProgress showOnHistoryPage onMigrationComplete={loadSessionsData} />
      <div className="px-10 pb-4 h-full flex flex-col">
        <div className="flex flex-row items-center justify-between gap-3 my-2">
          <div className="flex flex-row gap-1 bg-secondary/30 p-1 rounded-xl">
            <button
              className={cx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === 'allInOne'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-primary-text/70 hover:text-primary-text hover:bg-secondary/50',
              )}
              onClick={() => setActiveTab('allInOne')}
            >
              {t('All-In-One')}
            </button>
            <button
              className={cx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === 'individual'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-primary-text/70 hover:text-primary-text hover:bg-secondary/50',
              )}
              onClick={() => setActiveTab('individual')}
            >
              {t('Individual bot')}
            </button>
          </div>
        </div>
        <div className="flex flex-row items-center gap-3 my-2">
          <SearchInput value={sessionSearch} onChange={setSessionSearch} />
        </div>
        <div className="text-xs text-primary-text opacity-85 mb-1 px-1 font-medium flex flex-row items-center gap-2">
          <span>{sessionStatsText}</span>
          {searchProgressText && (
            <span className="opacity-70">· {searchProgressText}</span>
          )}
          {previewProgressText && (
            <span className="opacity-70">· {previewProgressText}</span>
          )}
        </div>

        {/* Scrollable session list container */}
        <div
          ref={sessionListRef}
          className="overflow-y-auto custom-scrollbar flex-1 min-h-0 mb-1"
        >
          {loadingSessions && (
            <div className="text-sm text-primary-text opacity-85 text-center py-8">{t('Loading sessions...')}</div>
          )}
          {!loadingSessions && filteredSessions.length === 0 && (
            <div className="text-sm text-primary-text opacity-85 text-center py-8 border border-dashed border-primary-border rounded-xl">
              {t('No sessions found.')}
            </div>
          )}
          {!loadingSessions && visibleSessions.length > 0 && (
            <div className="pr-1">
              <ViewportList
                viewportRef={sessionListRef}
                items={sessionsWithPreview}
                initialAlignToTop={true}
              >
                {(s) => {
                  const sessionKey = s._sessionKey
                  const isSelected = selectedSessionKey === sessionKey
                  return (
                    <div
                      key={sessionKey}
                      className="mb-3"
                      ref={(node) => {
                        sessionCardRefs.current.set(sessionKey, node)
                      }}
                    >
                      <SessionCard
                        session={s}
                        isSelected={isSelected}
                        onToggleSelect={(key) => setSelectedSessionKey((prev) => (prev === key ? null : key))}
                        onRestore={restoreSession}
                        onCopy={handleCopySession}
                        onDownloadMd={handleDownloadMd}
                        onDownloadJson={handleDownloadJson}
                        actionLoading={actionLoadingKey === sessionKey}
                      />
                    </div>
                  )
                }}
              </ViewportList>
            </div>
          )}
        </div>

        {canLoadMoreSessions && (
          <div className="flex flex-row items-center justify-center gap-2 py-2">
            <button
              className="px-3 py-1.5 rounded-xl text-sm font-medium border border-primary-border hover:bg-secondary/50 transition-colors"
              onClick={() => loadMoreSessions(50)}
            >
              {t('Load 50 more')}
            </button>
            <button
              className="px-3 py-1.5 rounded-xl text-sm font-medium border border-primary-border hover:bg-secondary/50 transition-colors"
              onClick={() => loadMoreSessions(300)}
            >
              {t('Load 300 more')}
            </button>
          </div>
        )}
      </div>
    </PagePanel>
  )
}

export default HistoryPage
