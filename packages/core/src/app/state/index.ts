import { atom } from 'jotai'
import { atomWithImmer } from 'jotai-immer'
import { atomFamily, atomWithStorage } from 'jotai/utils'
import { createBotInstance } from '~app/bots'
import { getDefaultThemeColor } from '~app/utils/color-scheme'
import { Campaign } from '~services/server-api'
import { ChatMessageModel } from '~types'
import { uuid } from '~utils'
import { CompanyProfilePreset } from '~services/company-profile'


type Param = { index: number; page: string }

export const chatFamily = atomFamily(
  (param: Param) => {
    console.log(`chatFamily atom created with param:`, param);
    return atomWithImmer({
      index: param.index,
      bot: createBotInstance(param.index),
      messages: [] as ChatMessageModel[],
      generatingMessageId: '',
      abortController: undefined as AbortController | undefined,
      conversationId: uuid(),
      shouldAutoScroll: true, // 自動スクロール制御用
    })
  },
  (a, b) => a.index === b.index && a.page === b.page,
)

export const licenseKeyAtom = atomWithStorage('licenseKey', '', undefined, { getOnInit: true })
export const sidebarCollapsedAtom = atomWithStorage('sidebarCollapsed', false, undefined, { getOnInit: true })
export const sidebarDisplayModeAtom = atomWithStorage<'auto' | 'hamburger' | 'fixed'>('sidebarDisplayMode', 'auto', undefined, { getOnInit: true })
export const themeColorAtom = atomWithStorage('themeColor', getDefaultThemeColor())
export const followArcThemeAtom = atomWithStorage('followArcTheme', false)
export const sidePanelBotAtom = atomWithStorage<number>('sidePanelBot', 0)
export const showDiscountModalAtom = atom<false | true | Campaign>(false)
export const releaseNotesAtom = atom<{ version: string; notes: string[] }[]>([])
export const systemPromptUpdateAtom = atom<boolean>(false)
export const pendingSearchQueryAtom = atom<string | null>(null)
export const sessionRestoreModalAtom = atom(false)
export const companyProfileModalAtom = atom(false)
export const detectedCompanyAtom = atom<CompanyProfilePreset | null>(null)
export const sessionToRestoreAtom = atom<{
  type: 'single' | 'allInOne' | 'sessionSnapshot'
  botIndex?: number
  conversationId?: string
  sessionId?: string
  sessionUUID?: string
  botIndices?: number[]
  layout?: string
  pairName?: string
  conversations?: { [botIndex: number]: { id: string; messages: any[] }[] }
  conversationSnapshots?: { [botIndex: number]: string }
  snapshotMessages?: { [botIndex: number]: any[] }
} | null>(null)

// All-in-one複数ボット同時復元用のatom
export const allInOneRestoreDataAtom = atom<{ [botIndex: number]: { conversationId: string; messages: any[] } } | null>(null)

// All-in-oneの入力テキストを保持するatom（レイアウト変更時も維持）
export const allInOneInputTextAtom = atom<string>('')

// All-in-oneの添付ファイルを保持するatom（レイアウト変更時も維持）
export const allInOneInputAttachmentsAtom = atom<Array<{
  id: string;
  file: File;
  type: 'image' | 'text' | 'audio' | 'video' | 'pdf';
  content?: string;
  transcribedText?: string;
}>>([])

// 入力をクリアするための派生atom
export const clearAllInOneInputAtom = atom(null, (get, set) => {
  set(allInOneInputTextAtom, '')
  set(allInOneInputAttachmentsAtom, [])
})
