import type { SnapshotMeta, AioMeta, SingleMeta } from '~services/chat-history'

export type ActiveTab = 'allInOne' | 'individual'

export type SessionListItem =
  | {
      type: 'sessionSnapshot'
      sessionUUID: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      botIndices: number[]
      layout: string
      pairName?: string
      firstMessage?: string
      botResponses?: { botName: string; response: string; botIcon?: string }[]
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }
  | {
      type: 'allInOneLegacy'
      sessionId: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      botIndices: number[]
      layout: string
      pairName?: string
      firstMessage?: string
      botResponses?: { botName: string; response: string; botIcon?: string }[]
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }
  | {
      type: 'single'
      botIndex: number
      conversationId: string
      createdAt: number
      lastUpdated: number
      messageCount: number
      firstMessage?: string
      lastMessage?: string
      botResponses?: { botName: string; response: string; botIcon?: string }[]
      botNames?: string[]
      botIcons?: string[]
      _sessionKey: string
      _searchString: string
    }

export type RestoreWarning = {
  type: 'individual_bot_missing' | 'aio_bots_missing'
  item: SessionListItem
  missingBotIndices: number[]
  missingBotNames: string[]
  availableBots: { index: number; name: string }[]
}

export type AnyMeta = SnapshotMeta | AioMeta | SingleMeta
