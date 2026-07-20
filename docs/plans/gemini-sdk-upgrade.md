# @google/genai SDK — Major Version Behind

Noticed while working on Gemini provider support (v2.18.2 cycle):

- Installed: `1.31.0` (pinned as `^1.31.0` in `package.json`)
- Latest on npm: `2.12.0` — a **major** version jump (1.x → 2.x)

Not touched in this release; a major bump needs its own scoped upgrade task
(read the changelog for breaking changes, check `src/app/bots/gemini-api/`
and the `GeminiApiBot` construction in `custombot.ts` against the new API
surface, retest thinking mode / image gen / web search / vertex mode paths).

Possibly relevant to Google's Gemini "Enterprise Agent Platform" renaming
(the Vertex AI Agent Builder rebrand) — worth checking whether the 2.x SDK
line changes anything about Vertex mode, auth, or endpoint behavior that our
`VertexMode`/`AuthMode` handling in `custombot.ts` currently assumes about 1.x.

Not investigated further — just flagging that we're behind a major version.
