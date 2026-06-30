import { FC, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BiMessageSquare, BiX, BiTrash, BiCheck, BiChevronDown } from 'react-icons/bi'
import { UserConfig, CustomApiConfig, SystemPromptMode, CustomApiProvider } from '~services/user-config'
import { CustomBot } from '~app/bots/custombot'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AddChatbotProposal {
  type: 'add_chatbot'
  chatbot: Partial<CustomApiConfig> & { name: string; model: string; provider: CustomApiProvider }
}

interface UpdateChatbotProposal {
  type: 'update_chatbot'
  name: string
  changes: Partial<CustomApiConfig>
}

interface UpdateGeneralProposal {
  type: 'update_general'
  changes: Partial<UserConfig>
}

type SettingsProposal = AddChatbotProposal | UpdateChatbotProposal | UpdateGeneralProposal

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  proposal?: SettingsProposal | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractProposal(text: string): SettingsProposal | null {
  const match = text.match(/```settings-apply\n([\s\S]*?)\n```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as SettingsProposal
  } catch {
    return null
  }
}

function stripProposalBlock(text: string): string {
  return text.replace(/```settings-apply\n[\s\S]*?\n```/g, '').trim()
}

function buildSettingsSystemPrompt(config: UserConfig): string {
  const bots = (config.customApiConfigs || []).map((bot, i) => {
    const sysMsg = bot.systemMessage
      ? bot.systemMessage.length > 300
        ? bot.systemMessage.substring(0, 300) + '...[truncated]'
        : bot.systemMessage
      : ''
    return {
      index: i,
      name: bot.name,
      model: bot.model,
      provider: bot.provider,
      enabled: bot.enabled !== false,
      systemPromptMode: bot.systemPromptMode,
      systemMessage: sysMsg,
      thinkingMode: bot.thinkingMode ?? false,
      webAccess: bot.webAccess ?? false,
      providerWebSearch: bot.providerWebSearch,
    }
  })

  const providers = (config.providerConfigs || []).map((p) => ({
    name: p.name,
    provider: p.provider,
  }))

  const commonMsg = config.commonSystemMessage
    ? config.commonSystemMessage.length > 300
      ? config.commonSystemMessage.substring(0, 300) + '...[truncated]'
      : config.commonSystemMessage
    : ''

  const settingsJson = JSON.stringify(
    {
      chatbots: bots,
      providers,
      general: {
        startupPage: config.startupPage,
        fontType: config.fontType,
        titleGenerationBotIndex: config.titleGenerationBotIndex ?? null,
        titleLanguage: config.titleLanguage,
        titleUpdateEveryTurn: config.titleUpdateEveryTurn,
        commonSystemMessage: commonMsg,
      },
    },
    null,
    2,
  )

  return `You are a helpful assistant for HuddleLLM, a Chrome extension for chatting with multiple AI APIs.
The user is on the settings page and wants help with their configuration.

Current settings (API keys and endpoint URLs excluded for security):
\`\`\`json
${settingsJson}
\`\`\`

You can answer questions about the settings AND propose configuration changes.
When proposing changes, include a settings-apply block AFTER your explanation:

\`\`\`settings-apply
{
  "type": "add_chatbot",
  "chatbot": {
    "name": "Bot Name",
    "shortName": "Short",
    "model": "model-id",
    "provider": "openai",
    "temperature": 0.7,
    "systemMessage": "",
    "systemPromptMode": "common",
    "avatar": "ChatGPT",
    "apiKey": "",
    "host": "",
    "thinkingMode": false,
    "webAccess": false,
    "providerWebSearch": false,
    "enabled": true
  }
}
\`\`\`

Or for updating an existing chatbot:
\`\`\`settings-apply
{"type":"update_chatbot","name":"Existing Bot Name","changes":{"model":"new-model","temperature":0.5}}
\`\`\`

Leave apiKey and host as empty strings — the user will enter these securely in a popup.
Only include a settings-apply block when the user explicitly asks to change or add settings.`
}

// ─── Apply Diff Modal ─────────────────────────────────────────────────────────

interface ApplyModalProps {
  proposal: SettingsProposal
  userConfig: UserConfig
  onApply: (proposal: SettingsProposal, tokens: Record<string, string>) => void
  onCancel: () => void
}

const ApplyModal: FC<ApplyModalProps> = ({ proposal, userConfig, onApply, onCancel }) => {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [host, setHost] = useState('')

  const needsApiKey =
    proposal.type === 'add_chatbot' && (!proposal.chatbot.apiKey || proposal.chatbot.apiKey === '')
  const needsHost =
    proposal.type === 'add_chatbot' && (!proposal.chatbot.host || proposal.chatbot.host === '')

  const renderDiff = () => {
    if (proposal.type === 'add_chatbot') {
      const bot = proposal.chatbot
      const fields: [string, string][] = [
        ['Name', bot.name],
        ['Short Name', bot.shortName ?? ''],
        ['Model', bot.model],
        ['Provider', bot.provider],
        ['Temperature', String(bot.temperature ?? 0.7)],
        ['Thinking Mode', bot.thinkingMode ? 'on' : 'off'],
        ['Web Access', bot.webAccess ? 'on' : 'off'],
        ['System Message', bot.systemMessage ? (bot.systemMessage.length > 60 ? bot.systemMessage.substring(0, 60) + '...' : bot.systemMessage) : '(none)'],
      ]
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Add Chatbot Label')}: {bot.name}</p>
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-green-500 font-mono">+</span>
              <span className="opacity-60 w-28 flex-shrink-0">{k}:</span>
              <span className="font-mono break-all">{v || '—'}</span>
            </div>
          ))}
        </div>
      )
    }

    if (proposal.type === 'update_chatbot') {
      const existing = (userConfig.customApiConfigs || []).find((b) => b.name === proposal.name)
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Update Chatbot Label')}: {proposal.name}</p>
          {Object.entries(proposal.changes).map(([k, v]) => {
            const before = existing ? String((existing as any)[k] ?? '—') : '—'
            return (
              <div key={k} className="text-xs">
                <span className="opacity-60">{k}:</span>
                <div className="flex gap-2 ml-2">
                  <span className="text-red-500 font-mono line-through">{before}</span>
                  <span className="text-green-500 font-mono">{String(v)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    if (proposal.type === 'update_general') {
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Update General Label')}</p>
          {Object.entries(proposal.changes).map(([k, v]) => {
            const before = String((userConfig as any)[k] ?? '—')
            return (
              <div key={k} className="text-xs">
                <span className="opacity-60">{k}:</span>
                <div className="flex gap-2 ml-2">
                  <span className="text-red-500 font-mono line-through">{before}</span>
                  <span className="text-green-500 font-mono">{String(v)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return null
  }

  const handleApply = () => {
    onApply(proposal, { apiKey, host })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-96 bg-primary-background border border-primary-border rounded-2xl shadow-2xl p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{t('Review Settings Change')}</span>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-primary-border transition-colors opacity-60 hover:opacity-100">
            <BiX size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-primary-border bg-primary-border/20 p-3">
          {renderDiff()}
        </div>

        {(needsApiKey || needsHost) && (
          <div className="space-y-3">
            <p className="text-xs opacity-60">{t('Settings Apply Credentials Note')}</p>
            {needsApiKey && (
              <div>
                <label className="text-xs opacity-70 block mb-1">{t('API Key')}</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full text-xs rounded-lg border border-primary-border bg-primary-background px-2 py-1.5 focus:outline-none focus:border-primary-blue placeholder:opacity-40"
                />
              </div>
            )}
            {needsHost && (
              <div>
                <label className="text-xs opacity-70 block mb-1">{t('API Host')} ({t('optional')})</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full text-xs rounded-lg border border-primary-border bg-primary-background px-2 py-1.5 focus:outline-none focus:border-primary-blue placeholder:opacity-40"
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] opacity-50">{t('Settings Apply Not Saved Note')}</p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-lg border border-primary-border hover:bg-primary-border transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={needsApiKey && !apiKey.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary-blue text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
          >
            <BiCheck size={14} />
            {t('Apply to Settings')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  userConfig: UserConfig
  onUpdateConfig: (update: Partial<UserConfig>) => void
}

const SettingsChatFloat: FC<Props> = ({ userConfig, onUpdateConfig }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selectedBotIndex, setSelectedBotIndex] = useState<number>(-1)
  const [applyTarget, setApplyTarget] = useState<SettingsProposal | null>(null)
  const [showBotSelector, setShowBotSelector] = useState(false)
  const botRef = useRef<CustomBot | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const bots = userConfig.customApiConfigs || []

  // Determine default bot on mount
  useEffect(() => {
    const firstEnabled = bots.findIndex((b) => b.enabled !== false)
    setSelectedBotIndex(firstEnabled >= 0 ? firstEnabled : bots.length > 0 ? 0 : -1)
  }, []) // only on first render

  const hasBot = selectedBotIndex >= 0 && selectedBotIndex < bots.length
  const botName = hasBot ? bots[selectedBotIndex].name : ''

  const createBot = (index: number) => {
    if (index < 0 || index >= bots.length) return null
    const systemPrompt = buildSettingsSystemPrompt(userConfig)
    return new CustomBot({ customBotNumber: index + 1, systemMessageOverride: systemPrompt })
  }

  // Initialize or recreate bot
  useEffect(() => {
    if (!open || !hasBot) return
    if (botRef.current) return // already initialized
    botRef.current = createBot(selectedBotIndex)
  }, [open, hasBot, selectedBotIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchBot = (newIndex: number) => {
    if (generating) {
      abortRef.current?.abort()
      setGenerating(false)
    }
    setSelectedBotIndex(newIndex)
    botRef.current = createBot(newIndex)
    setMessages([])
    setShowBotSelector(false)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const clearChat = () => {
    if (generating) {
      abortRef.current?.abort()
      setGenerating(false)
    }
    botRef.current?.resetConversation()
    setMessages([])
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !botRef.current || generating) return

    const userMsgId = `u-${Date.now()}`
    const assistantMsgId = `a-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ])
    setInput('')
    setGenerating(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const generator = botRef.current.sendMessage({ prompt: text, signal: controller.signal })
      for await (const payload of generator) {
        if (controller.signal.aborted) break
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: payload.text, proposal: extractProposal(payload.text) }
              : m,
          ),
        )
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: errMsg, error: true } : m)),
        )
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleApply = (proposal: SettingsProposal, tokens: Record<string, string>) => {
    const newConfigs = [...(userConfig.customApiConfigs || [])]

    if (proposal.type === 'add_chatbot') {
      const newId = Math.max(...newConfigs.map((c) => c.id ?? 0), 0) + 1
      const base: CustomApiConfig = {
        id: newId,
        name: proposal.chatbot.name,
        shortName: proposal.chatbot.shortName ?? proposal.chatbot.name.substring(0, 6),
        model: proposal.chatbot.model,
        host: tokens.host || proposal.chatbot.host || '',
        temperature: proposal.chatbot.temperature ?? 0.7,
        systemMessage: proposal.chatbot.systemMessage ?? '',
        systemPromptMode: proposal.chatbot.systemPromptMode ?? SystemPromptMode.COMMON,
        avatar: proposal.chatbot.avatar ?? '',
        apiKey: tokens.apiKey || proposal.chatbot.apiKey || '',
        thinkingMode: proposal.chatbot.thinkingMode ?? false,
        thinkingBudget: proposal.chatbot.thinkingBudget ?? 2000,
        provider: proposal.chatbot.provider,
        webAccess: proposal.chatbot.webAccess ?? false,
        providerWebSearch: proposal.chatbot.providerWebSearch ?? false,
        enabled: proposal.chatbot.enabled !== false,
      }
      onUpdateConfig({ customApiConfigs: [...newConfigs, base] })
    } else if (proposal.type === 'update_chatbot') {
      const idx = newConfigs.findIndex((b) => b.name === proposal.name)
      if (idx >= 0) {
        newConfigs[idx] = { ...newConfigs[idx], ...proposal.changes }
        onUpdateConfig({ customApiConfigs: newConfigs })
      }
    } else if (proposal.type === 'update_general') {
      onUpdateConfig(proposal.changes)
    }

    setApplyTarget(null)
  }

  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
    }

    if (msg.error) {
      return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
    }

    const displayText = stripProposalBlock(msg.content)
    const proposal = msg.proposal

    return (
      <div className="space-y-2">
        {displayText && (
          <span className="whitespace-pre-wrap break-words">{displayText}</span>
        )}
        {!displayText && !proposal && msg.role === 'assistant' && generating && (
          <span className="opacity-50 animate-pulse">...</span>
        )}
        {proposal && (
          <div className="mt-2 rounded-xl border border-primary-border bg-primary-background/60 p-2.5">
            <p className="text-[10px] opacity-60 mb-1.5">{t('Settings Proposal Label')}</p>
            <p className="text-xs font-medium mb-2">
              {proposal.type === 'add_chatbot' && `${t('Add Chatbot')}: ${proposal.chatbot.name}`}
              {proposal.type === 'update_chatbot' && `${t('Update Chatbot')}: ${proposal.name}`}
              {proposal.type === 'update_general' && t('Update General Settings')}
            </p>
            <button
              onClick={() => setApplyTarget(proposal)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-primary-blue text-white hover:brightness-110 transition-all flex items-center gap-1"
            >
              <BiCheck size={12} />
              {t('Review & Apply')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('Ask about settings')}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-primary-blue text-white flex items-center justify-center shadow-lg hover:brightness-110 transition-all"
      >
        <BiMessageSquare size={22} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 h-[480px] bg-primary-background border border-primary-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{t('Settings Assistant')}</div>
              {/* Bot selector */}
              {bots.length > 0 ? (
                <div className="relative">
                  <button
                    onClick={() => setShowBotSelector((v) => !v)}
                    className="flex items-center gap-0.5 text-xs opacity-50 hover:opacity-80 transition-opacity max-w-[160px]"
                  >
                    <span className="truncate">{botName || t('Select bot')}</span>
                    <BiChevronDown size={12} className="flex-shrink-0" />
                  </button>
                  {showBotSelector && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-primary-background border border-primary-border rounded-xl shadow-lg py-1 z-10">
                      {bots.map((bot, idx) => (
                        <button
                          key={idx}
                          onClick={() => switchBot(idx)}
                          className={`w-full text-left text-xs px-3 py-1.5 hover:bg-primary-border transition-colors truncate ${idx === selectedBotIndex ? 'font-semibold' : ''}`}
                        >
                          {bot.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs opacity-50">{t('No bot')}</div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={clearChat}
                title={t('Clear conversation')}
                className="p-1.5 rounded-lg hover:bg-primary-border transition-colors opacity-60 hover:opacity-100"
              >
                <BiTrash size={16} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title={t('Close')}
                className="p-1.5 rounded-lg hover:bg-primary-border transition-colors opacity-60 hover:opacity-100"
              >
                <BiX size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {!hasBot ? (
              <div className="text-xs opacity-60 text-center mt-8">{t('Settings Chat No Bot')}</div>
            ) : messages.length === 0 ? (
              <div className="text-xs opacity-50 text-center mt-8 px-4 leading-relaxed">
                {t('Settings Chat Security Note')}
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] text-xs rounded-xl px-3 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary-blue text-white'
                        : msg.error
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700'
                          : 'bg-primary-border'
                    }`}
                  >
                    {renderMessageContent(msg)}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {hasBot && messages.length > 0 && (
            <div className="px-3 pb-1 flex-shrink-0">
              <p className="text-[10px] opacity-30 text-center">{t('Settings Chat Security Note Short')}</p>
            </div>
          )}

          {/* Input */}
          {hasBot && (
            <div className="flex-shrink-0 border-t border-primary-border p-2 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('Settings Chat Placeholder')}
                rows={2}
                disabled={generating}
                className="flex-1 resize-none text-xs rounded-lg border border-primary-border bg-primary-background px-2 py-1.5 focus:outline-none focus:border-primary-blue placeholder:opacity-40 disabled:opacity-50 custom-scrollbar"
              />
              <button
                onClick={sendMessage}
                disabled={generating || !input.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary-blue text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              >
                {t('Send')}
              </button>
            </div>
          )}
        </div>
      )}

      {applyTarget && (
        <ApplyModal
          proposal={applyTarget}
          userConfig={userConfig}
          onApply={handleApply}
          onCancel={() => setApplyTarget(null)}
        />
      )}
    </>
  )
}

export default SettingsChatFloat
