import { FC, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { BiMessageSquare, BiX, BiTrash, BiCheck, BiChevronDown, BiSearch } from 'react-icons/bi'
import { UserConfig, CustomApiConfig, SystemPromptMode, CustomApiProvider, type ProviderConfig } from '~services/user-config'
import { CustomBot } from '~app/bots/custombot'
import { allIconChoices } from './IconSelect'
import { MAX_CUSTOM_MODELS } from './ChatbotSettings'
import Markdown from '~app/components/Markdown'
import BotIcon from '~app/components/BotIcon'
import { fetchProviderModels, ModelFetchConfig } from '~utils/model-fetcher'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AddChatbotProposal {
  type: 'add_chatbot'
  // "provider" is omittable when "providerRefId" (in Partial<CustomApiConfig>) points at an
  // existing provider to reuse — its provider/apiKey/host resolve from there instead.
  chatbot: Partial<CustomApiConfig> & { name: string; model: string; provider?: CustomApiProvider }
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

// AIが提案するプロバイダー定義（APIキーは含めない — ポップアップで別途入力）
interface ProviderSpec {
  name: string
  provider: CustomApiProvider
  host: string
  isHostFullPath?: boolean
  icon?: string
  isAnthropicUsingAuthorizationHeader?: boolean
  AuthMode?: 'header' | 'default'
  VertexMode?: boolean
  outputType?: 'text' | 'image'
}

// プロバイダー（接続）とそれを使うチャットボットを1セットで追加する提案。
// HuddleLLM は Provider（host+key）+ Chatbot（model）の2層設計なので、まとめて提案できるようにする。
interface AddProviderProposal {
  type: 'add_provider'
  provider: ProviderSpec
  chatbots?: Array<Partial<CustomApiConfig> & { name: string; model: string }>
}

type SettingsProposal = AddChatbotProposal | UpdateChatbotProposal | UpdateGeneralProposal | AddProviderProposal

interface ListModelsAction {
  action: 'list_models'
  chatbot: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  error?: boolean
  proposal?: SettingsProposal | null
  toolStatus?: 'pending' | 'success' | 'error'
  toolLabel?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractProposal(text: string): SettingsProposal | null {
  const match = text.match(/```settings-apply\r?\n([\s\S]*?)\r?\n```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as SettingsProposal
  } catch {
    return null
  }
}

function stripProposalBlock(text: string): string {
  return text.replace(/```settings-apply\r?\n[\s\S]*?\r?\n```/g, '').trim()
}

function extractAction(text: string): ListModelsAction | null {
  const match = text.match(/```settings-action\r?\n([\s\S]*?)\r?\n```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (parsed?.action === 'list_models' && typeof parsed.chatbot === 'string') {
      return parsed as ListModelsAction
    }
    return null
  } catch {
    return null
  }
}

function stripActionBlock(text: string): string {
  return text
    .replace(/```settings-action\r?\n[\s\S]*?\r?\n```/g, '')
    // 一部モデルは独自の <tool_call> タグでブロックを包むことがあるため、残骸も除去する
    .replace(/<\/?tool_call>/g, '')
    .trim()
}

// AIが指定したチャットボット名から、実際にモデル一覧取得に使うAPIキー/ホストを解決する。
// bot自身のhost/apiKey → 紐付くprovider → 共通設定、の優先順でフォールバック（ChatbotSettingsの解決ロジックと同じ）。
function resolveModelFetchConfig(bot: CustomApiConfig, config: UserConfig): ModelFetchConfig {
  const providerRef = bot.providerRefId
    ? (config.providerConfigs || []).find((p) => p.id === bot.providerRefId)
    : undefined

  const host = providerRef?.host?.trim()
    ? providerRef.host
    : bot.host?.trim()
      ? bot.host
      : config.customApiHost

  const apiKey = providerRef?.apiKey?.trim()
    ? providerRef.apiKey
    : bot.apiKey?.trim()
      ? bot.apiKey
      : config.customApiKey

  const isHostFullPath = providerRef
    ? (providerRef.isHostFullPath ?? false)
    : bot.host?.trim()
      ? (bot.isHostFullPath ?? false)
      : (config.isCustomApiHostFullPath ?? false)

  return {
    provider: providerRef?.provider ?? bot.provider,
    apiKey: apiKey || '',
    host: host || '',
    isHostFullPath,
  }
}

// AIが提案した avatar が有効なアイコンIDか検証。無効なら空文字にフォールバック
const validAvatarIds = new Set(allIconChoices.map((i) => i.id))
function sanitizeAvatar(value: unknown): string {
  return typeof value === 'string' && validAvatarIds.has(value) ? value : ''
}

// AIが提案した providerRefId が実在する providerConfigs の id か検証。無効なら undefined にフォールバック
function sanitizeProviderRefId(value: unknown, config: UserConfig): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const exists = (config.providerConfigs || []).some((p) => p.id === value)
  return exists ? value : undefined
}

// AIが提案した provider スキーム値が CustomApiProvider の有効な値か検証
const validProviderSchemes = new Set(Object.values(CustomApiProvider) as string[])
function sanitizeProviderScheme(value: unknown): CustomApiProvider | undefined {
  return typeof value === 'string' && validProviderSchemes.has(value)
    ? (value as CustomApiProvider)
    : undefined
}

// 新規プロバイダーのID生成（ApiProviderSettings と同じ形式）
function genProviderId(): string {
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// AI提案のチャットボット spec から CustomApiConfig を構築。apiKey/host/provider/providerRefId は
// 呼び出し側が解決した値を渡す（AI提案のapiKeyは決して信用しない）。
function buildChatbotConfig(
  spec: Partial<CustomApiConfig> & { name: string; model: string },
  opts: { id: number; provider: CustomApiProvider; providerRefId?: string; apiKey: string; host: string },
): CustomApiConfig {
  return {
    id: opts.id,
    name: spec.name,
    shortName: spec.shortName ?? spec.name.substring(0, 6),
    model: spec.model,
    host: opts.host,
    temperature: spec.temperature ?? 0.7,
    systemMessage: spec.systemMessage ?? '',
    systemPromptMode: spec.systemPromptMode ?? SystemPromptMode.COMMON,
    avatar: sanitizeAvatar(spec.avatar),
    apiKey: opts.apiKey,
    thinkingMode: spec.thinkingMode ?? false,
    thinkingBudget: spec.thinkingBudget ?? 2000,
    provider: opts.provider,
    providerRefId: opts.providerRefId,
    webAccess: spec.webAccess ?? false,
    providerWebSearch: spec.providerWebSearch ?? false,
    enabled: spec.enabled !== false,
  }
}

// update_general で変更を許可するフィールド（クレデンシャル・bot定義は含まない）
const GENERAL_SETTINGS_WHITELIST = [
  'startupPage',
  'fontType',
  'titleGenerationBotIndex',
  'titleLanguage',
  'titleUpdateEveryTurn',
  'commonSystemMessage',
] as const

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
      providerRefId: bot.providerRefId || null,
      enabled: bot.enabled !== false,
      avatar: bot.avatar || '',
      systemPromptMode: bot.systemPromptMode,
      systemMessage: sysMsg,
      thinkingMode: bot.thinkingMode ?? false,
      webAccess: bot.webAccess ?? false,
      providerWebSearch: bot.providerWebSearch,
    }
  })

  const providers = (config.providerConfigs || []).map((p) => ({
    id: p.id,
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

  const iconList = allIconChoices.map((i) => `"${i.id}" (${i.name})`).join(', ')

  return `You are a helpful assistant for HuddleLLM, a Chrome extension for chatting with multiple AI APIs.
The user is on the settings page and wants help with their configuration.

Current settings (API keys and endpoint URLs excluded for security):
\`\`\`json
${settingsJson}
\`\`\`

Valid "avatar" icon IDs (use the exact id string, nothing else): ${iconList}

You can answer questions about the settings AND propose configuration changes.
When proposing changes, include a settings-apply block AFTER your explanation:

\`\`\`settings-apply
{
  "type": "add_chatbot",
  "chatbot": {
    "name": "Bot Name",
    "shortName": "Short",
    "model": "model-id-that-this-specific-provider-actually-serves",
    "provider": "<the CustomApiProvider value matching how this model is actually called — see rules>",
    "providerRefId": "<omit this line unless reusing an existing provider from the list above>",
    "temperature": 0.7,
    "systemMessage": "",
    "systemPromptMode": "common",
    "avatar": "chatgpt",
    "apiKey": "",
    "host": "",
    "thinkingMode": "<true/false — decide per model, see rules, do not just copy this>",
    "webAccess": false,
    "providerWebSearch": false,
    "enabled": true
  }
}
\`\`\`

If the model is available through a provider that is ALREADY configured (check the "providers" list above by
name/id — e.g. the user's existing "OpenRouter" connection can serve many different vendors' models under one
key), reuse it: set "providerRefId" to that provider's "id" and OMIT "provider", "apiKey", and "host" entirely.
This avoids asking the user to re-enter credentials they already have configured. Only fall back to raw
"provider" + empty apiKey/host (for the popup) when no existing provider actually serves that model.

Or for updating an existing chatbot:
\`\`\`settings-apply
{"type":"update_chatbot","name":"Existing Bot Name","changes":{"model":"new-model","temperature":0.5}}
\`\`\`

HuddleLLM separates configuration into two layers: a "provider" (the connection: host + API key) and a
"chatbot" (a model + params that references a provider). When the user wants to connect a NEW service that is
not in the "providers" list above (e.g. a coding-plan endpoint, a self-hosted or 3rd-party OpenAI-compatible
API), propose BOTH together in a single block — the new provider AND at least one chatbot that uses it. The
user then enters the API key ONCE in the popup:

\`\`\`settings-apply
{
  "type": "add_provider",
  "provider": {
    "name": "Human-readable connection name",
    "provider": "<one of the scheme values listed below>",
    "host": "<the EXACT base URL from the service's docs>",
    "isHostFullPath": false,
    "isAnthropicUsingAuthorizationHeader": false
  },
  "chatbots": [
    {
      "name": "Bot Name",
      "shortName": "Short",
      "model": "model-id-this-service-serves",
      "avatar": "chatgpt",
      "temperature": 0.7,
      "systemPromptMode": "common",
      "thinkingMode": false
    }
  ]
}
\`\`\`

Valid "provider" scheme values and when to use each:
- "openai" — any OpenAI-compatible Chat Completions API (most 3rd-party/self-hosted/coding-plan endpoints). Default choice.
- "anthropic" — native Anthropic Messages API (host ends in the Anthropic-style path). Set "isAnthropicUsingAuthorizationHeader" if the service wants a Bearer token instead of x-api-key.
- "openrouter" — the OpenRouter gateway specifically.
- "google" / "openai-gemini" / "vertexai-gemini" — Google Gemini variants.
- "openai-responses" — OpenAI Responses API. "openai-qwen", "chutes-ai" — those specific compatible services.
- Image providers: "novita-ai", "replicate", "openai-image" (set "outputType":"image").
- Do NOT use "bedrock", "vertexai-claude", "image-agent" unless the user is clearly configuring those.

"host" + "isHostFullPath" rules (critical — a wrong URL fails with 404 or can incur wrong billing):
- HuddleLLM builds the request URL from these two fields. For "openai"-scheme providers, when
  "isHostFullPath" is FALSE, HuddleLLM AUTOMATICALLY APPENDS "/v1/chat/completions" to the host (it only
  special-cases a host already ending in "/v1"). So false is correct ONLY when the real endpoint is exactly
  <host>/v1/chat/completions (e.g. host "https://api.openai.com").
- If the service's chat endpoint does NOT fit that "<base>/v1/chat/completions" shape — e.g. the base path
  carries a different version like ".../v3", or it is a coding-plan / gateway path — then set
  "isHostFullPath": true and put the COMPLETE endpoint URL (including "/chat/completions") in "host".
  Example: Volcengine Ark coding plan → host "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  isHostFullPath true. (host ".../api/coding/v3" with isHostFullPath false would wrongly become
  ".../api/coding/v3/v1/chat/completions" → 404.)
- Always follow the service's own docs for the exact base URL; if a doc warns against a particular URL, avoid it.

You can also check the models actually available for an existing chatbot's configured provider, instead of
guessing model names. Use this when the user asks what models are available, or before proposing a specific
model value if you are not certain it exists. To request this, respond with a short lead-in sentence and
ONLY this block (do not include a settings-apply block in the same response):

\`\`\`settings-action
{"action":"list_models","chatbot":"Existing Bot Name"}
\`\`\`

The extension will fetch the list locally using the already-configured API key (which is never sent to you)
and give you the result as a tool message in the next turn — wait for that before proposing a model change
based on it.

Rules:
- Base every answer and proposal on the current settings JSON above — never invent chatbots, models, or values that are not there.
- For "update_chatbot" and "list_models", the name/"chatbot" field MUST exactly match one of the existing chatbot names. Ask the user which one if it is ambiguous.
- The template above shows the JSON shape, not values to copy. Every field must be reasoned about from the
  actual context (existing bots/providers, the specific model) — do not reuse a template's literal example
  value (e.g. "openai", "false") when it does not actually fit.
- "provider" must match how this model is ACTUALLY called, not where it originated. A model available through
  a multi-vendor gateway (e.g. "openrouter") must use that provider, even if the model itself is from Anthropic
  or Google. Prefer "providerRefId" (see above) whenever an existing provider already serves the model.
- "thinkingMode" should reflect whether extended reasoning suits that specific model, not a fixed default —
  many current frontier/reasoning models benefit from it being on.
- "avatar" MUST be one of the valid icon IDs listed above. If no icon fits (e.g. a brand with no icon), say so instead of guessing.
- Only include fields you actually want to change in "changes".
- Leave apiKey and host as empty strings unless using "providerRefId" — the user will enter these securely in a popup.
- For "add_provider": NEVER include an apiKey field — the user enters it once in the popup. Fill everything else
  (name, provider scheme, host, isHostFullPath) from the service's docs. Always bundle at least one chatbot so
  the user ends up with a usable setup, not a bare connection.
- Use "add_provider" when the connection does not exist yet; use "add_chatbot" with "providerRefId" when it does.
- Only include a settings-apply block when the user explicitly asks to change or add settings.
- Only include a settings-action block when you actually need a live model list to answer accurately.`
}

// ─── Apply Diff Modal ─────────────────────────────────────────────────────────

interface ApplyModalProps {
  proposal: SettingsProposal
  userConfig: UserConfig
  onApply: (proposal: SettingsProposal, tokens: Record<string, string>) => void
  onCancel: () => void
}

// フィールドキー → 表示ラベル（設定画面の表記に合わせる）
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  shortName: 'Short Name',
  model: 'Model',
  provider: 'Provider',
  avatar: 'Icon',
  temperature: 'Temperature',
  systemMessage: 'System Message',
  systemPromptMode: 'System Prompt Mode',
  thinkingMode: 'Thinking Mode',
  webAccess: 'Web Access',
  providerWebSearch: 'Provider Web Search',
  enabled: 'Enabled',
  apiKey: 'API Key',
  host: 'API Host',
  isHostFullPath: 'Full Path',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

// 値の種類ごとに設定画面と同じ見た目で描画（アイコンは画像、真偽値はバッジ、その他はテキスト）
function renderFieldValue(key: string, value: unknown, opts: { masked?: boolean } = {}) {
  if (opts.masked) {
    return <span className="font-mono">{value ? '••••••••' : '(none)'}</span>
  }
  if (key === 'avatar') {
    const iconId = typeof value === 'string' ? value : ''
    if (!iconId) return <span className="opacity-50">(none)</span>
    const iconMeta = allIconChoices.find((i) => i.id === iconId)
    return (
      <span className="inline-flex items-center gap-1.5">
        <BotIcon iconName={iconId} size={16} />
        <span className="font-mono">{iconMeta?.name ?? iconId}</span>
      </span>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${value ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-gray-500/15 opacity-70'}`}>
        {value ? 'ON' : 'OFF'}
      </span>
    )
  }
  if (value === undefined || value === null || value === '') {
    return <span className="opacity-50">(none)</span>
  }
  const text = String(value)
  return <span className="font-mono break-all">{text.length > 80 ? text.substring(0, 80) + '...' : text}</span>
}

const ApplyModal: FC<ApplyModalProps> = ({ proposal, userConfig, onApply, onCancel }) => {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [host, setHost] = useState('')

  // add_chatbot が既存の provider を再利用する場合、credential はそのproviderから解決されるため
  // ポップアップでの再入力は不要になる。
  const reusedProviderId =
    proposal.type === 'add_chatbot' ? sanitizeProviderRefId(proposal.chatbot.providerRefId, userConfig) : undefined
  const reusedProvider = reusedProviderId
    ? (userConfig.providerConfigs || []).find((p) => p.id === reusedProviderId)
    : undefined

  // Security: API Key is ALWAYS collected via popup, never trusted from the AI proposal.
  //  - add_chatbot: always required (new bot has no key), unless reusing an existing provider
  //  - add_provider: always required (new connection needs a key)
  //  - update_chatbot: required only when the AI proposed an apiKey change
  const needsApiKey =
    (proposal.type === 'add_chatbot' && !reusedProviderId) ||
    proposal.type === 'add_provider' ||
    (proposal.type === 'update_chatbot' && 'apiKey' in proposal.changes)
  // Host is not secret; only ask when missing for add_chatbot, when the add_provider AI proposal left it
  // empty, or when AI proposed a host change.
  const needsHost =
    (proposal.type === 'add_chatbot' && !reusedProviderId && !proposal.chatbot.host) ||
    (proposal.type === 'add_provider' && !proposal.provider.host) ||
    (proposal.type === 'update_chatbot' && 'host' in proposal.changes && !proposal.changes.host)

  // 1フィールド分の行。Before側は update 系のみ表示（add は新規作成なので比較対象がない）
  const renderFieldRow = (key: string, afterValue: unknown, opts: { showBefore?: boolean; beforeValue?: unknown; masked?: boolean } = {}) => {
    const { showBefore = false, beforeValue, masked = false } = opts
    return (
      <div key={key} className="grid grid-cols-[minmax(0,80px)_1fr] gap-x-3 gap-y-1 py-1.5 text-xs border-b border-primary-border/50 last:border-0">
        <span className="opacity-60 pt-0.5">{t(fieldLabel(key))}</span>
        <div className="min-w-0">
          {showBefore ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="opacity-50 line-through">{renderFieldValue(key, beforeValue, { masked })}</span>
              <span className="opacity-40">→</span>
              <span>{renderFieldValue(key, afterValue, { masked })}</span>
            </div>
          ) : (
            renderFieldValue(key, afterValue, { masked })
          )}
        </div>
      </div>
    )
  }

  const renderDiff = () => {
    if (proposal.type === 'add_chatbot') {
      const bot = proposal.chatbot
      const providerDisplay = reusedProvider
        ? `${reusedProvider.name} (${t('Settings Chat Reusing Provider')})`
        : bot.provider
      const fields: [string, unknown][] = [
        ['name', bot.name],
        ['shortName', bot.shortName ?? ''],
        ['provider', providerDisplay],
        ['model', bot.model],
        ['avatar', bot.avatar ?? ''],
        ['systemPromptMode', bot.systemPromptMode ?? SystemPromptMode.COMMON],
        ['temperature', bot.temperature ?? 0.7],
        ['thinkingMode', bot.thinkingMode ?? false],
        ['webAccess', bot.webAccess ?? false],
        ['systemMessage', bot.systemMessage ?? ''],
      ]
      return (
        <div>
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Add Chatbot Label')}: {bot.name}</p>
          {fields.map(([k, v]) => renderFieldRow(k, v))}
        </div>
      )
    }

    if (proposal.type === 'add_provider') {
      const p = proposal.provider
      const providerFields: [string, unknown][] = [
        ['name', p.name],
        ['provider', p.provider],
        ['host', p.host],
        ['isHostFullPath', p.isHostFullPath ?? false],
      ]
      const bots = proposal.chatbots ?? []
      return (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Add Provider Label')}: {p.name}</p>
            {providerFields.map(([k, v]) => renderFieldRow(k, v))}
          </div>
          {bots.map((bot, i) => (
            <div key={i} className="rounded-lg border border-primary-border/60 p-2">
              <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Add Chatbot Label')}: {bot.name}</p>
              {([
                ['name', bot.name],
                ['model', bot.model],
                ['avatar', bot.avatar ?? ''],
                ['systemPromptMode', bot.systemPromptMode ?? SystemPromptMode.COMMON],
                ['temperature', bot.temperature ?? 0.7],
                ['thinkingMode', bot.thinkingMode ?? false],
              ] as [string, unknown][]).map(([k, v]) => renderFieldRow(k, v))}
            </div>
          ))}
        </div>
      )
    }

    if (proposal.type === 'update_chatbot') {
      const existing = (userConfig.customApiConfigs || []).find((b) => b.name === proposal.name)
      return (
        <div>
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Update Chatbot Label')}: {proposal.name}</p>
          {Object.entries(proposal.changes).map(([k, v]) =>
            renderFieldRow(k, v, {
              showBefore: true,
              beforeValue: existing ? (existing as any)[k] : undefined,
              masked: k === 'apiKey' || k === 'host',
            }),
          )}
        </div>
      )
    }

    if (proposal.type === 'update_general') {
      return (
        <div>
          <p className="text-xs font-medium opacity-70 mb-2">{t('Settings Apply Update General Label')}</p>
          {Object.entries(proposal.changes).map(([k, v]) =>
            renderFieldRow(k, v, { showBefore: true, beforeValue: (userConfig as any)[k] }),
          )}
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

// パネルの初期サイズ（画面に応じて自動調整、上限・下限あり）
function getDefaultPanelSize() {
  if (typeof window === 'undefined') return { width: 448, height: 704 }
  return {
    width: Math.min(448, window.innerWidth - 40),
    height: Math.min(window.innerHeight * 0.7, 704),
  }
}

const PANEL_MIN_WIDTH = 320
const PANEL_MIN_HEIGHT = 320

const SettingsChatFloat: FC<Props> = ({ userConfig, onUpdateConfig }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selectedBotIndex, setSelectedBotIndex] = useState<number>(-1)
  const [applyTarget, setApplyTarget] = useState<SettingsProposal | null>(null)
  const [showBotSelector, setShowBotSelector] = useState(false)
  const [panelSize, setPanelSize] = useState(getDefaultPanelSize)
  const botRef = useRef<CustomBot | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 左上角ハンドルからのドラッグでリサイズ（右下は固定のまま左・上に広がる）
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = panelSize.width
    const startHeight = panelSize.height
    const maxWidth = window.innerWidth - 40
    const maxHeight = window.innerHeight - 96

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      const deltaY = startY - moveEvent.clientY
      setPanelSize({
        width: Math.min(maxWidth, Math.max(PANEL_MIN_WIDTH, startWidth + deltaX)),
        height: Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, startHeight + deltaY)),
      })
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

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

  // 設定が変わったら（適用後やユーザーの編集後）プロンプトを最新の設定で更新。
  // 会話履歴は保持したままシステムプロンプトだけ差し替える。
  useEffect(() => {
    if (!botRef.current) return
    void botRef.current.updateSystemMessageOverride(buildSettingsSystemPrompt(userConfig))
  }, [userConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // ボットセレクタの外側クリックで閉じる
  const botSelectorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showBotSelector) return
    const handler = (e: MouseEvent) => {
      if (botSelectorRef.current && !botSelectorRef.current.contains(e.target as Node)) {
        setShowBotSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBotSelector])

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

  // AIが settings-action(list_models) を要求したときに実行。実際のfetchはローカルで行い、
  // 結果（モデルIDのみ、キーは含まない）をtoolメッセージとしてAIに送り返して続きの返答を得る。
  const runListModelsAction = async (action: ListModelsAction) => {
    const bot = bots.find((b) => b.name === action.chatbot)
    const toolMsgId = `t-${Date.now()}`

    if (!bot) {
      setMessages((prev) => [
        ...prev,
        {
          id: toolMsgId,
          role: 'tool',
          content: '',
          toolStatus: 'error',
          toolLabel: t('Settings Chat Bot Not Found', { name: action.chatbot }),
        },
      ])
      return
    }

    setMessages((prev) => [
      ...prev,
      {
        id: toolMsgId,
        role: 'tool',
        content: '',
        toolStatus: 'pending',
        toolLabel: t('Settings Chat Fetching Models', { name: bot.name }),
      },
    ])

    let resultText: string
    try {
      const fetchConfig = resolveModelFetchConfig(bot, userConfig)
      const models = await fetchProviderModels(fetchConfig)
      const ids = models.map((m) => m.id)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === toolMsgId
            ? { ...m, toolStatus: 'success', toolLabel: t('Settings Chat Models Fetched', { name: bot.name, count: ids.length }) }
            : m,
        ),
      )
      resultText = `[Tool result] Available models for "${bot.name}": ${JSON.stringify(ids)}`
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === toolMsgId
            ? { ...m, toolStatus: 'error', toolLabel: t('Settings Chat Models Fetch Failed', { name: bot.name }) }
            : m,
        ),
      )
      resultText = `[Tool result] Failed to fetch models for "${bot.name}": ${errMsg}`
    }

    if (!botRef.current) return
    const followUpId = `a-${Date.now()}`
    setMessages((prev) => [...prev, { id: followUpId, role: 'assistant', content: '' }])
    setGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const generator = botRef.current.sendMessage({ prompt: resultText, signal: controller.signal })
      for await (const payload of generator) {
        if (controller.signal.aborted) break
        setMessages((prev) =>
          prev.map((m) =>
            m.id === followUpId
              ? { ...m, content: payload.text, proposal: extractProposal(payload.text) }
              : m,
          ),
        )
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        setMessages((prev) =>
          prev.map((m) => (m.id === followUpId ? { ...m, content: errMsg, error: true } : m)),
        )
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
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

    let finalText = ''
    let aborted = false
    try {
      const generator = botRef.current.sendMessage({ prompt: text, signal: controller.signal })
      for await (const payload of generator) {
        if (controller.signal.aborted) {
          aborted = true
          break
        }
        finalText = payload.text
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: payload.text, proposal: extractProposal(payload.text) }
              : m,
          ),
        )
      }
    } catch (err) {
      finalText = ''
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

    if (!aborted && !controller.signal.aborted && finalText) {
      const action = extractAction(finalText)
      if (action) {
        await runListModelsAction(action)
      }
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
      if (newConfigs.some((b) => b.name === proposal.chatbot.name)) {
        toast.error(t('Settings Chat Duplicate Name', { name: proposal.chatbot.name }))
        return
      }
      if (newConfigs.length >= MAX_CUSTOM_MODELS) {
        toast.error(t('Maximum number of custom models ({{count}}) reached.', { count: MAX_CUSTOM_MODELS }))
        return
      }
      const newId = Math.max(...newConfigs.map((c) => c.id ?? 0), 0) + 1
      // 既存の provider を再利用する場合、apiKey/host はそのproviderから解決されるため
      // ここでは空のまま（ポップアップでの再入力を要求しない）にする。
      const providerRefId = sanitizeProviderRefId(proposal.chatbot.providerRefId, userConfig)
      const referencedProvider = providerRefId
        ? (userConfig.providerConfigs || []).find((p) => p.id === providerRefId)
        : undefined
      const resolvedProvider = referencedProvider?.provider ?? proposal.chatbot.provider
      if (!resolvedProvider) {
        toast.error(t('Settings Chat No Provider'))
        return
      }
      // Security: apiKey/host are only ever taken from the popup, never from the AI proposal.
      // When reusing an existing provider (providerRefId), they resolve from that provider at runtime.
      const base = buildChatbotConfig(proposal.chatbot, {
        id: newId,
        provider: resolvedProvider,
        providerRefId,
        apiKey: providerRefId ? '' : tokens.apiKey,
        host: providerRefId ? '' : tokens.host || proposal.chatbot.host || '',
      })
      onUpdateConfig({ customApiConfigs: [...newConfigs, base] })
    } else if (proposal.type === 'add_provider') {
      const scheme = sanitizeProviderScheme(proposal.provider.provider)
      if (!scheme) {
        toast.error(t('Settings Chat Invalid Provider Scheme'))
        return
      }
      const host = tokens.host || proposal.provider.host || ''
      if (!host) {
        toast.error(t('Settings Chat No Host'))
        return
      }
      const specBots = proposal.chatbots ?? []
      // 追加後の合計がモデル上限を超えないか確認
      if (newConfigs.length + specBots.length > MAX_CUSTOM_MODELS) {
        toast.error(t('Maximum number of custom models ({{count}}) reached.', { count: MAX_CUSTOM_MODELS }))
        return
      }
      for (const b of specBots) {
        if (newConfigs.some((c) => c.name === b.name)) {
          toast.error(t('Settings Chat Duplicate Name', { name: b.name }))
          return
        }
      }
      const providerId = genProviderId()
      const newProvider: ProviderConfig = {
        id: providerId,
        name: proposal.provider.name || `Provider ${(userConfig.providerConfigs || []).length + 1}`,
        provider: scheme,
        host,
        isHostFullPath: proposal.provider.isHostFullPath ?? false,
        // Security: apiKey comes ONLY from the popup, never from the AI proposal.
        apiKey: tokens.apiKey,
        icon: proposal.provider.icon || 'OpenAI.Black',
        isAnthropicUsingAuthorizationHeader: proposal.provider.isAnthropicUsingAuthorizationHeader ?? false,
        ...(proposal.provider.AuthMode ? { AuthMode: proposal.provider.AuthMode } : {}),
        ...(proposal.provider.VertexMode !== undefined ? { VertexMode: proposal.provider.VertexMode } : {}),
        ...(proposal.provider.outputType ? { outputType: proposal.provider.outputType } : {}),
      }
      // 束ねたチャットボットは、この新プロバイダーを providerRefId で参照（apiKey/host は空＝プロバイダーから解決）
      let nextId = Math.max(...newConfigs.map((c) => c.id ?? 0), 0)
      const newBots = specBots.map((b) =>
        buildChatbotConfig(b, {
          id: ++nextId,
          provider: scheme,
          providerRefId: providerId,
          apiKey: '',
          host: '',
        }),
      )
      onUpdateConfig({
        providerConfigs: [...(userConfig.providerConfigs || []), newProvider],
        customApiConfigs: [...newConfigs, ...newBots],
      })
    } else if (proposal.type === 'update_chatbot') {
      const idx = newConfigs.findIndex((b) => b.name === proposal.name)
      if (idx < 0) {
        toast.error(t('Settings Chat Bot Not Found', { name: proposal.name }))
        return
      }
      const changes: Partial<CustomApiConfig> = { ...proposal.changes }
      // Security: ignore any apiKey the AI proposed; only accept the popup-entered value.
      // If the user left it blank, keep the existing key rather than clearing it.
      if ('apiKey' in changes) {
        if (tokens.apiKey) {
          changes.apiKey = tokens.apiKey
        } else {
          delete changes.apiKey
        }
      }
      if ('host' in changes && tokens.host) {
        changes.host = tokens.host
      }
      if ('avatar' in changes) {
        changes.avatar = sanitizeAvatar(changes.avatar)
      }
      newConfigs[idx] = { ...newConfigs[idx], ...changes }
      onUpdateConfig({ customApiConfigs: newConfigs })
    } else if (proposal.type === 'update_general') {
      // Only allow changes to general (non-destructive) fields; reject anything that could
      // rewrite customApiConfigs / providerConfigs / credentials.
      const safe: Partial<UserConfig> = {}
      for (const key of GENERAL_SETTINGS_WHITELIST) {
        if (key in proposal.changes) {
          ;(safe as any)[key] = (proposal.changes as any)[key]
        }
      }
      if (Object.keys(safe).length === 0) {
        toast.error(t('Settings Chat No Valid General Fields'))
        return
      }
      onUpdateConfig(safe)
    }

    toast.success(t('Settings Chat Applied'))
    setApplyTarget(null)
  }

  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
    }

    if (msg.error) {
      return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
    }

    const displayText = stripActionBlock(stripProposalBlock(msg.content))
    const proposal = msg.proposal

    return (
      <div className="space-y-2">
        {displayText && (
          <div className="settings-chat-markdown">
            <Markdown>{displayText}</Markdown>
          </div>
        )}
        {!displayText && !proposal && msg.role === 'assistant' && generating && (
          <span className="opacity-50 animate-pulse">...</span>
        )}
        {proposal && (
          <div className="mt-2 rounded-xl border border-primary-border bg-primary-background/60 p-2.5">
            <p className="text-[10px] opacity-60 mb-1.5">{t('Settings Proposal Label')}</p>
            <p className="text-xs font-medium mb-2">
              {proposal.type === 'add_chatbot' && `${t('Add Chatbot')}: ${proposal.chatbot.name}`}
              {proposal.type === 'add_provider' && `${t('Add Provider')}: ${proposal.provider.name}`}
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
        <div
          className="fixed bottom-20 right-5 z-50 bg-primary-background border border-primary-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            width: `${panelSize.width}px`,
            height: `${panelSize.height}px`,
          }}
        >
          {/* Resize handle (top-left corner; bottom-right stays anchored). Inset so the
              square handle clears the panel's rounded-2xl corner curve instead of being
              clipped by overflow-hidden. */}
          <div
            onMouseDown={handleResizeStart}
            title={t('Drag to resize')}
            className="absolute top-1.5 left-1.5 w-4 h-4 cursor-nwse-resize z-10 rounded bg-primary-border/40 flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-primary-border/70 transition-all"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="pointer-events-none">
              <path d="M2 8L8 2M5 8L8 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{t('Settings Assistant')}</div>
              {/* Bot selector */}
              {bots.length > 0 ? (
                <div className="relative" ref={botSelectorRef}>
                  <button
                    onClick={() => setShowBotSelector((v) => !v)}
                    className="flex items-center gap-0.5 text-xs opacity-50 hover:opacity-80 transition-opacity max-w-[160px]"
                  >
                    <span className="truncate">{botName || t('Select bot')}</span>
                    <BiChevronDown size={12} className="flex-shrink-0" />
                  </button>
                  {showBotSelector && (
                    <div className="absolute top-full left-0 mt-1 w-48 max-h-56 overflow-y-auto custom-scrollbar bg-primary-background border border-primary-border rounded-xl shadow-lg py-1 z-10">
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
                onClick={() => {
                  // 生成中にパネルを閉じたら abort する
                  if (generating) {
                    abortRef.current?.abort()
                    setGenerating(false)
                  }
                  setOpen(false)
                }}
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
              messages.map((msg) =>
                msg.role === 'tool' ? (
                  <div key={msg.id} className="flex justify-center">
                    <div
                      className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border ${
                        msg.toolStatus === 'error'
                          ? 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'border-primary-border text-primary-text/60 bg-primary-background'
                      }`}
                    >
                      <BiSearch size={11} className={msg.toolStatus === 'pending' ? 'animate-pulse' : ''} />
                      {msg.toolLabel}
                    </div>
                  </div>
                ) : (
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
                ),
              )
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
