# Settings Assistant (β) — Future Improvements

## Current State
`SettingsChatFloat.tsx` sends a static system prompt built from the current
`UserConfig` snapshot (bot list, provider list, general settings — API keys
and hosts excluded). The AI answers/proposes changes purely from that JSON
plus its own general knowledge. It has no access to the actual URL-building
logic in the codebase.

## Known Gap: Host/URL construction rules
Users ask things like "should I include `/v1`?" or "how do I point this at a
3rd-party OpenAI-compatible endpoint?". The real answer depends on
provider-specific logic scattered across `src/app/bots/*/index.ts` and
`src/app/bots/custombot.ts` (e.g. `isHostFullPath` auto-appends
`v1/chat/completions` unless ON; `VertexAI_Gemini`/`GeminiOpenAI` force full
path; `VertexAI_Claude` hides the toggle entirely; `Google` disables the host
field). None of this is in the system prompt today, so the assistant can only
guess from generic LLM knowledge — risk of confidently-wrong answers for
custom/3rd-party hosts (v1 vs v3, gateway-style URLs, etc).

## Known Gap: "google"-scheme AuthMode/VertexMode not documented (found via live Gemini test)
Live-tested (background agent) asking the assistant to set up a brand-new direct
Google Gemini API provider (non-Vertex, "Google AI Studio", host
`https://generativelanguage.googleapis.com`). The assistant correctly picked
scheme `google` and the right host, but left `AuthMode`/`VertexMode` unset.
Root cause: the system prompt's `add_provider` guidance only says
`"google" / "openai-gemini" / "vertexai-gemini" — Google Gemini variants.` —
it never explains `AuthMode` or `VertexMode` at all, so the AI has no way to
propose them correctly. This isn't an AI reasoning failure, it's a prompt gap:
we never gave it the option.

Why it matters (`custombot.ts:322-364`, `CustomApiProvider.Google` case):
- When a non-empty `host` is set AND `AuthMode` resolves to its default
  (`'header'`) AND an apiKey is present, HuddleLLM injects a raw
  `Authorization: <key>` header — this path is meant for gateway/proxy
  deployments (e.g. Rakuten AI Gateway), not the official endpoint (which the
  `@google/genai` SDK already authenticates itself via `x-goog-api-key`).
- Leaving `host` blank routes to the SDK's own default endpoint and skips this
  branch entirely — the cleanest choice for "just the real Google API, no
  gateway" cases like the one tested here.
- `VertexMode` controls Vertex AI vs. the plain Generative Language API and is
  also unmentioned in the prompt.

Not fixed in this session (deferred per user instruction — same category as
the URL/host gap above, candidate for the same agentic-lookup fix rather than
hand-writing yet more provider-specific prose into the prompt).

## Proposed Direction: Agentic tool-calling (on demand)
Rather than stuffing all provider URL rules into the system prompt for every
message (token cost, staleness risk), give the assistant an optional tool it
can call only when a question requires source-of-truth lookup:

- e.g. a `lookup_provider_url_rules(provider)` tool that returns the actual
  rule text for that provider (extracted from `custombot.ts` switch cases /
  a small maintained lookup table), fetched only when needed.
- The existing `src/services/agent/execute()` ReAct-style loop
  (`src/services/agent/index.ts`) already implements a tool-calling pattern
  (action/action_input JSON, streaming) that could serve as a reference
  implementation, though it's currently wired for web search, not settings
  introspection.
- `ChatGPTApiBot` already supports OpenAI-style `tools`/`tool_calls`
  (`setTools()`, tool_calls parsing in `src/app/bots/chatgpt-api/index.ts`),
  so function-calling plumbing exists for OpenAI-compatible providers; would
  need equivalent support/fallback for non-tool-calling providers (e.g. plain
  completion models) — possibly reuse the JSON-action-parsing approach from
  `services/agent` for those.

## Open Questions (revisit later)
- Where to source the "URL rules" text from — hand-maintained doc string vs.
  generated from the switch-case logic (risk of drift either way).
- Whether to expose this as a real tool call or just a second static prompt
  section injected only when the user's message matches URL/host-related
  keywords (cheaper, less "agentic" but may be good enough).
- Scope: today only local system-prompt context (no external tools); this
  would be the first case of the Settings Assistant reaching into the
  extension's own source logic rather than just its data.

## Broader learning (from the provider-reuse work)
The URL/host gap above is one instance of a general pattern: the assistant keeps
needing HuddleLLM-specific domain rules that live in code, not in the settings
JSON. Concrete cases hit while building `add_chatbot`:
- `provider` means "how the model is *called*" (e.g. everything through an
  OpenRouter gateway is provider=openrouter), not the model's vendor. The AI
  guessed `provider: "openai"` for a Claude model.
- Existing providers' credentials can be reused via `providerRefId` instead of
  re-prompting for an API key — but knowing *which* provider serves a given
  model requires understanding the provider list + routing behaviour.
- `thinkingMode`/other per-model suitability is model-knowledge, not settings.

Today each rule is hand-fed into the system prompt (see
`buildSettingsSystemPrompt` in `SettingsChatFloat.tsx`), which works but doesn't
scale — every new provider type or field adds more prompt text and drift risk.
The durable fix is the same agentic direction as above: let the assistant query
the codebase's own resolution logic (`custombot.ts` `createBotInstance`,
provider switch-cases, `MODEL_LIST`) on demand rather than mirroring it in prose.
Until then, the β ships with the hardcoded rules.

Parked for a future release; the β ships as-is with the hardcoded rules.
