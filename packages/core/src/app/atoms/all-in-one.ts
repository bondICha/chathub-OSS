import { atom } from 'jotai'
import { Layout } from '~app/consts'
import Browser from 'webextension-polyfill'
import { perfMark } from '~utils/perf'

// デフォルトボット設定
export const DEFAULT_BOTS: number[] = [0, 1, 2, 3, 4, 5]

// All-In-Oneペア設定の型定義
export interface AllInOnePairConfig {
  layout: Layout
  // 共通のボット設定（インデックス0から順に使用）
  // 例：[0, 1, 2, 3, 4, 5] の場合
  // - layout 1: bots[0] (1つ目のボット)
  // - layout 2: bots[0], bots[1] (1, 2つ目のボット)
  // - layout 3: bots[0], bots[1], bots[2] (1, 2, 3つ目のボット)
  // - layout 4: bots[0], bots[1], bots[2], bots[3] (1, 2, 3, 4つ目のボット)
  // - layout 6: bots[0]～bots[5] (1～6つ目のボット)
  bots: number[]
  pairName?: string
  // 後方互換性のため保持（廃止予定）
  singlePanelBots?: number[]
  twoPanelBots?: number[]
  threePanelBots?: number[]
  fourPanelBots?: number[]
  sixPanelBots?: number[]
}

// デフォルトのペア設定
export const DEFAULT_PAIR_CONFIG: AllInOnePairConfig = {
  layout: 2,
  bots: DEFAULT_BOTS, // [0, 1, 2, 3, 4, 5]
}

// All-In-Oneペア管理Atom（タブローカル、メモリ上のみ）
export const allInOnePairsAtom = atom<Record<string, AllInOnePairConfig>>(
  { default: DEFAULT_PAIR_CONFIG }
)

// アクティブなAll-In-Oneを管理するatom（タブローカル、メモリ上のみ）
export const activeAllInOneAtom = atom<string>('default')

// アクティブなペアを永続化して切り替えるwrite atom
export const setActiveAllInOneAtom = atom(null, async (get, set, pairId: string) => {
  set(activeAllInOneAtom, pairId)
  try {
    await Browser.storage.local.set({ activeAllInOnePair: pairId })
  } catch (error) {
    console.error('Failed to persist active pair:', error)
  }
})

// 初期化用のatom（前回の設定を復旧）
export const initializeAllInOneAtom = atom(null, async (get, set) => {
  perfMark('initializeAllInOne start')
  try {
    const result = await Browser.storage.local.get(['allInOnePairs', 'activeAllInOnePair'])
    const saved = result.allInOnePairs
    if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
      // default ペアがなければ追加
      if (!saved.default) {
        saved.default = DEFAULT_PAIR_CONFIG
      }
      set(allInOnePairsAtom, saved)
    } else {
      set(allInOnePairsAtom, { default: DEFAULT_PAIR_CONFIG })
    }
    // アクティブペアを復元（保存済みペアに存在する場合のみ）
    const activePairId = result.activeAllInOnePair
    if (activePairId && typeof activePairId === 'string') {
      const pairs = get(allInOnePairsAtom)
      if (pairs[activePairId]) {
        set(activeAllInOneAtom, activePairId)
      }
    }
  } catch (error) {
    console.error('Failed to restore all-in-one config:', error)
    set(allInOnePairsAtom, { default: DEFAULT_PAIR_CONFIG })
  }
  perfMark('initializeAllInOne done')
})

// 初期化中かどうかを管理するatom（タブローカル、メモリ上のみ）
export const isInitializingAtom = atom<boolean>(true)

// 現在のセッション名（AI生成）を管理するatom
export const currentSessionNameAtom = atom<string | undefined>(undefined)

// 設定保存用のatom
export const saveAllInOneConfigAtom = atom(null, async (get, set) => {
  const pairs = get(allInOnePairsAtom)
  try {
    await Browser.storage.local.set({ allInOnePairs: pairs })
  } catch (error) {
    console.error('Failed to save all-in-one config:', error)
  }
})