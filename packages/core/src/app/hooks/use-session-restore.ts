import { useEffect } from 'react'
import type { ExtractAtomValue } from 'jotai'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { getUserConfig } from '~services/user-config'
import { Layout } from '~app/consts'
import { AllInOnePairConfig, DEFAULT_PAIR_CONFIG } from '~app/atoms/all-in-one'
import { sessionToRestoreAtom, allInOneRestoreDataAtom } from '~app/state'

type SessionToRestoreData = ExtractAtomValue<typeof sessionToRestoreAtom>
type AllInOneRestoreData = ExtractAtomValue<typeof allInOneRestoreDataAtom>
type AllInOnePairsMap = Record<string, AllInOnePairConfig>
type SetState<T> = (update: T | ((prev: T) => T)) => void

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
 * Bot 不在で実有効bot数が元レイアウトに足りない場合、レイアウトを縮小する。
 * 縮小規則: 利用可能bot数を最大値とした標準レイアウトに変換する。
 * twoHorizon の方向（縦並び）は availableCount === 2 のときに限り保持される。
 * sixGrid 専用レイアウトは availableCount >= 5 でのみ維持（4以下は通常の四角レイアウトに）。
 */
function shrinkLayoutForAvailableBots(layout: Layout, availableCount: number): Layout {
  const required = getPanelCount(layout)
  if (availableCount >= required) return layout
  if (availableCount <= 1) return 'single'
  if (availableCount === 2) return layout === 'twoHorizon' ? 'twoHorizon' : 2
  if (availableCount === 3) return 3
  if (availableCount === 4) return 4
  // availableCount === 5 のときも sixGrid を維持
  return layout
}

/**
 * 有効な（enabled）ボットのインデックスを取得
 */
async function resolveEnabledBotIndices(): Promise<number[]> {
  try {
    const config = await getUserConfig()
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
 * リクエストされたbot indices を有効botでフィルタし、不在botがあれば toast で通知する。
 * 全て無効/未指定の場合は最初の有効bot 1つにフォールバックする。
 */
async function resolveEffectiveBotIndices(
  requestedBotIndices: number[],
  t: TFunction,
): Promise<number[]> {
  const enabledIndices = await resolveEnabledBotIndices()
  const validBotIndices = requestedBotIndices.filter((bi) => enabledIndices.includes(bi))
  const effectiveBotIndices = validBotIndices.length > 0 ? validBotIndices : enabledIndices.slice(0, 1)

  const missingBotIndices = requestedBotIndices.filter((bi) => !enabledIndices.includes(bi))
  if (missingBotIndices.length > 0) {
    const userConfig = await getUserConfig()
    const allConfigs = userConfig?.customApiConfigs || []
    const missingNames = missingBotIndices
      .map((bi) => allConfigs[bi]?.name || `Bot #${bi + 1}`)
      .join(', ')
    toast(t('restore_missing_bots_notice', { names: missingNames }), {
      duration: 6000,
    })
  }

  return effectiveBotIndices
}

/**
 * セッションに保存された layout（文字列/数値）を Layout 型に変換する
 */
function parseSessionLayout(sessionLayout: string | number | undefined): Layout {
  if (sessionLayout === 'single' || sessionLayout === 'twoHorizon' || sessionLayout === 'sixGrid') {
    return sessionLayout
  }
  const layoutNum = typeof sessionLayout === 'string' ? parseInt(sessionLayout) : sessionLayout
  if (layoutNum === 2) return 2
  if (layoutNum === 3) return 3
  if (layoutNum === 4) return 4
  return 2 // デフォルト
}

/**
 * effective bot indices と layout から AllInOnePairConfig を組み立てる。
 * 後方互換性のため、layout に応じた legacy フィールド（singlePanelBots 等）も同時に設定する。
 */
function buildPairConfig(
  effectiveBotIndices: number[],
  pairName: string | undefined,
  sessionLayout: string | number | undefined,
): AllInOnePairConfig {
  const restoredLayout = shrinkLayoutForAvailableBots(parseSessionLayout(sessionLayout), effectiveBotIndices.length)

  const newPairConfig: AllInOnePairConfig = {
    ...DEFAULT_PAIR_CONFIG,
    layout: restoredLayout,
    pairName,
    bots: effectiveBotIndices,
  }

  if (effectiveBotIndices.length > 0) {
    if (restoredLayout === 'single') newPairConfig.singlePanelBots = effectiveBotIndices
    else if (restoredLayout === 2 || restoredLayout === 'twoHorizon') newPairConfig.twoPanelBots = effectiveBotIndices
    else if (restoredLayout === 3) newPairConfig.threePanelBots = effectiveBotIndices
    else if (restoredLayout === 4) newPairConfig.fourPanelBots = effectiveBotIndices
    else if (restoredLayout === 'sixGrid') newPairConfig.sixPanelBots = effectiveBotIndices
  }

  return newPairConfig
}

interface UseSessionRestoreOptions {
  sessionToRestore: SessionToRestoreData
  activeAllInOne: string
  setAllInOnePairs: SetState<AllInOnePairsMap>
  setAllInOneRestoreData: SetState<AllInOneRestoreData>
  setCurrentSessionUUID: (uuid: string | null) => void
  setSessionToRestore: SetState<SessionToRestoreData>
}

export function useSessionRestore({
  sessionToRestore,
  activeAllInOne,
  setAllInOnePairs,
  setAllInOneRestoreData,
  setCurrentSessionUUID,
  setSessionToRestore,
}: UseSessionRestoreOptions) {
  const { t } = useTranslation()

  // セッションスナップショット復元の処理
  useEffect(() => {
    const restoreSessionSnapshot = async () => {
      if (sessionToRestore && sessionToRestore.type === 'sessionSnapshot') {
        try {
          const { botIndices, layout: sessionLayout, pairName, snapshotMessages, sessionUUID } = sessionToRestore

          // 復元されたセッションのUUIDを保持
          setCurrentSessionUUID(sessionUUID || null)

          const effectiveBotIndices = await resolveEffectiveBotIndices(botIndices || [], t)
          const newPairConfig = buildPairConfig(effectiveBotIndices, pairName, sessionLayout)

          // Session復元設定を適用
          const sessionRestoreKey = `session-${sessionUUID}`
          setAllInOnePairs((prev) => ({
            ...prev,
            [sessionRestoreKey]: newPairConfig,
            default: newPairConfig,
            [activeAllInOne]: newPairConfig,
          }))

          // スナップショットメッセージを有効なボットに直接復元
          setTimeout(() => {
            if (snapshotMessages && effectiveBotIndices.length > 0) {
              const restoreData: NonNullable<AllInOneRestoreData> = {}

              for (const botIndex of effectiveBotIndices) {
                const messages = snapshotMessages[botIndex]
                if (messages && messages.length > 0) {
                  restoreData[botIndex] = {
                    conversationId: `snapshot-${sessionUUID}-${botIndex}`,
                    messages: messages,
                  }
                }
              }

              setAllInOneRestoreData(restoreData)

              // 復元データクリア
              setTimeout(() => {
                setAllInOneRestoreData(null)
              }, 2000)
            }
          }, 300)

          setSessionToRestore(null)
        } catch (error) {
          console.error('Failed to restore session snapshot:', error)
          toast.error(t('Failed to restore session.'))
          setSessionToRestore(null)
        }
      }
    }

    restoreSessionSnapshot()
  }, [sessionToRestore, activeAllInOne, setAllInOnePairs, setSessionToRestore, setAllInOneRestoreData, t, setCurrentSessionUUID])

  // All-in-oneセッション復元の処理（旧版・後方互換性用）
  useEffect(() => {
    const restoreAllInOneSession = async () => {
      if (sessionToRestore && sessionToRestore.type === 'allInOne') {
        try {
          const { botIndices, layout: sessionLayout, pairName, conversations } = sessionToRestore

          // All-in-oneセッションの場合は新しいUUIDを生成（後方互換性のため）
          setCurrentSessionUUID(null)

          const effectiveBotIndices = await resolveEffectiveBotIndices(botIndices || [], t)
          const newPairConfig = buildPairConfig(effectiveBotIndices, pairName, sessionLayout)

          setAllInOnePairs((prev) => ({
            ...prev,
            [activeAllInOne]: newPairConfig,
          }))

          setTimeout(async () => {
            try {
              if (conversations && effectiveBotIndices.length > 0) {
                const restoreData: NonNullable<AllInOneRestoreData> = {}

                for (const botIndex of effectiveBotIndices) {
                  const botConversations = conversations[botIndex]
                  if (botConversations && botConversations.length > 0) {
                    const latestConversation = botConversations[0]
                    restoreData[botIndex] = {
                      conversationId: latestConversation.id,
                      messages: latestConversation.messages,
                    }
                  }
                }

                setAllInOneRestoreData(restoreData)

                setTimeout(() => {
                  setAllInOneRestoreData(null)
                }, 2000)
              }
            } catch (error) {
              console.error('Failed to restore All-in-one conversations:', error)
            }
          }, 300)

          setSessionToRestore(null)
        } catch (error) {
          console.error('Failed to restore All-in-one session:', error)
          toast.error(t('Failed to restore session.'))
          setSessionToRestore(null)
        }
      }
    }

    restoreAllInOneSession()
  }, [sessionToRestore, activeAllInOne, setAllInOnePairs, setSessionToRestore, setAllInOneRestoreData, t, setCurrentSessionUUID])
}
