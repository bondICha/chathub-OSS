import dayjs from 'dayjs'
import type { ChatMessageModel } from '~services/chat-history'
import {
  loadHistoryMessages,
  getSessionSnapshot,
  loadAllInOneSessions,
} from '~services/chat-history'
import { getUserConfig } from '~services/user-config'
import type { SessionListItem } from './types'

export function formatConversationAsMarkdown(messages: ChatMessageModel[], botName: string): string {
  return messages
    .filter((m) => m.text)
    .map((m) => {
      const role = m.author === 'user' ? 'User' : botName
      return `**${role}:** ${m.text}`
    })
    .join('\n\n')
}

type BotConversation = { botName: string; messages: ChatMessageModel[] }

async function loadSessionConversations(item: SessionListItem): Promise<{ title: string; conversations: BotConversation[] }> {
  const config = await getUserConfig()
  const botNames = (config.customApiConfigs || []).map((c, i) => c.name || `Bot ${i + 1}`)
  const conversations: BotConversation[] = []
  let title = 'pairName' in item ? (item.pairName || '') : ''

  if (item.type === 'single') {
    const all = await loadHistoryMessages(item.botIndex)
    const conv = all.find((c) => c.id === item.conversationId)
    const botName = botNames[item.botIndex] || `Bot ${item.botIndex + 1}`
    if (!title) title = botName
    if (conv && conv.messages.length > 0) {
      conversations.push({ botName, messages: conv.messages })
    }
  } else if (item.type === 'sessionSnapshot') {
    const snapshot = await getSessionSnapshot(item.sessionUUID)
    if (snapshot) {
      for (const botIndex of item.botIndices) {
        const msgs = snapshot.conversations[botIndex] || []
        if (msgs.length > 0) {
          conversations.push({ botName: botNames[botIndex] || `Bot ${botIndex + 1}`, messages: msgs })
        }
      }
    }
  } else if (item.type === 'allInOneLegacy') {
    const aioSessions = await loadAllInOneSessions()
    const session = aioSessions.find((s) => s.id === item.sessionId)
    if (session) {
      for (const botIndex of item.botIndices) {
        const allConvs = session.conversations[botIndex] || []
        const snapId = session.conversationSnapshots?.[botIndex]
        const targetConv = snapId ? allConvs.find((c) => c.id === snapId) : allConvs[0]
        if (targetConv && targetConv.messages.length > 0) {
          conversations.push({ botName: botNames[botIndex] || `Bot ${botIndex + 1}`, messages: targetConv.messages })
        }
      }
    }
  }

  return { title, conversations }
}

export async function buildSessionMarkdown(item: SessionListItem): Promise<string> {
  const { title, conversations } = await loadSessionConversations(item)
  const sections: string[] = []
  const isMultiBot = conversations.length > 1

  if (title && isMultiBot) sections.push(`# ${title}\n`)

  for (const conv of conversations) {
    const md = formatConversationAsMarkdown(conv.messages, conv.botName)
    if (isMultiBot) {
      sections.push(`## ${conv.botName}\n\n${md}`)
    } else {
      sections.push(md)
    }
  }

  return sections.join('\n\n---\n\n')
}

export async function buildSessionJSON(item: SessionListItem): Promise<string> {
  const { title, conversations } = await loadSessionConversations(item)
  const json = {
    title: title || undefined,
    createdAt: dayjs(item.createdAt).toISOString(),
    lastUpdated: dayjs(item.lastUpdated).toISOString(),
    conversations: conversations.map((conv) => ({
      botName: conv.botName,
      messages: conv.messages
        .filter((m) => m.text)
        .map((m) => ({
          role: m.author === 'user' ? 'user' as const : 'assistant' as const,
          botName: m.author === 'user' ? undefined : conv.botName,
          text: m.text,
          ...(m.thinking ? { thinking: m.thinking } : {}),
        })),
    })),
  }
  return JSON.stringify(json, null, 2)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
