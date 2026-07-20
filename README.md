<p align="center">
    <img src="./src/assets/icon.png" width="150">
</p>

<h1 align="center">HuddleLLM</h1>

### HuddleLLM is an All-in-One Chatbot Client

## Install

#### From Store

<a href="https://chromewebstore.google.com/detail/huddlellm-oss-all-in-one/edjbcjkcabpmpcpnpfjfcehegjkacgod"><img src="https://user-images.githubusercontent.com/64502893/231991498-8df6dd63-727c-41d0-916f-c90c15127de3.png" width="200" alt="Get HuddleLLM for Chromium"></a> <a href="https://microsoftedge.microsoft.com/addons/detail/huddlellm-oss-%E3%82%AA%E3%83%BC%E3%83%AB%E3%82%A4%E3%83%B3%E3%83%AF%E3%83%B3%E3%83%81%E3%83%A3/kmphcofekafjmnpjegchboapjpgjhgch"><img src="https://user-images.githubusercontent.com/64502893/231991158-1b54f831-2fdc-43b6-bf9a-f894000e5aa8.png" width="160" alt="Get HuddleLLM for Microsoft Edge"></a>

> [!NOTE]
> Due to the lengthy review process by Microsoft, updates for the Microsoft Edge Extension may be delayed by over a week. We recommend installing from the Chrome Web Store.


## 📷 Screenshot

![Screenshot](screenshots/extension.png?raw=true)



## ✨ Features

- 🤖 Chat with multiple AIs side by side in one screen
- 🧩 Manage Native APIs, OpenRouter, and OpenAI-compatible providers in one place
- 🖼️🎙️🎬📄 Multimodal input: images, audio, video, and PDFs
- 🌐 Native Web Search for OpenAI Responses / Claude / Gemini. Other models can use HuddleLLM's own web search via Function Calls.
- 🎨 Seamless image generation with Nano Banana and the Image Agent that combines Chat with Image Generation APIs.
- ⚙️ Configure reasoning level and image-generation parameters in Chatbot settings, or tweak them per session via the Quick Settings panel
- 🧠 Auto-generate tab titles with your chosen AI
- 🪟 Open individual bots in the Chrome Side Panel for quick chats
- 🎙️ Transcribe audio (OpenAI Whisper / Gemini) and send it as text
- 🔎 Launch HuddleLLM by typing `hl <keyword>` in the address bar (Omnibox integration)
- 🔀 Use the `/btw` command to open a standalone popup that lets another AI analyze and compare answers from multiple AIs
- 📚 Prompt Library with custom and community prompts
- 💾 Local conversation history with full session restore
- 💾 Export / import all settings and conversation history

See [CHANGELOG.md](./CHANGELOG.md) for full release notes.

## 🤖 Supported Providers & Bots

### Native APIs
- **OpenAI** (Chat Completions / Responses API)
- **Google Gemini** (official `@google/genai` SDK; GenAI or Vertex)
- **Anthropic Claude**

### OpenAI-Compatible Providers
- **OpenRouter** (also supports audio and video input)
- DeepSeek, Qwen, xAI Grok, Z.AI GLM
- Together AI, Fireworks AI, Hyperbolic, DeepInfra, Nebius
- Any custom OpenAI-compatible endpoint

### Image Generation (via Image Agent)
- OpenAI Image (DALL·E 3, gpt-image-1)
- Google Gemini (Imagen / native image)
- Chutes AI (Chroma, FLUX.1-dev)
- Novita AI (Qwen Image, Hunyuan Image 3, Seedream 4.0)
- Replicate (Google Imagen 4, and more)

> [!NOTE]
> Feature availability depends on the provider and model.
> For example, PDF input is supported on Gemini, Claude, and OpenAI Responses; video input is currently supported on Gemini and OpenRouter.

## 🗂️ Multimodal Support

| Input Type | Supported Providers |
|---|---|
| 🖼️ Image | OpenAI, Gemini, Claude, OpenRouter, and more |
| 🎵 Audio (WAV / MP3 / OGG) | Gemini (native), OpenRouter, OpenAI Whisper / Gemini (Speech-to-Text) |
| 🎬 Video | Gemini, OpenRouter |
| 📄 PDF | Gemini, Claude, OpenAI Responses API |

## 🌐 Native API Web Search

HuddleLLM uses each provider's own web search tool when available — no extra context overhead, more stable results:

- OpenAI Responses: `web_search_preview`
- Anthropic Claude: `web_search_20250305`
- Google Gemini: `google_search` (with reference URLs)

For providers without a native search tool, HuddleLLM falls back to its own Web Agent that fetches results and injects them into the system prompt.

## 🎨 Image Agent

An agentic image generation system that combines LLM reasoning with image generation APIs:

1. You describe what you want in natural language
2. An LLM (Claude or any OpenAI-compatible) generates an optimized image prompt
3. The image generation API produces the image

Works across OpenAI Image, Google Gemini, Chutes AI, Novita AI, and Replicate.

## 🔨 Build from Source

- Clone the source code
- `corepack enable`
- `yarn install`
- `yarn build`
- In Chrome / Edge go to the Extensions page (chrome://extensions or edge://extensions)
- Enable Developer Mode
- Drag the `dist` folder anywhere on the page to import it (do not delete the folder afterward)

## Company Profile Setup

For organizations wanting to automatically apply company-specific API configurations, see [Company Profile Setup Guide](docs/COMPANY_PROFILE_SETUP.md).

## 📜 Privacy Policy / プライバシーポリシー / 隐私政策

> **TL;DR**: HuddleLLM stores all data (API keys, conversation history) **locally in your browser only**. No telemetry, no account required, no data sent to HuddleLLM servers. Network requests go directly from your browser to the API providers you configure.

### 🇯🇵 日本語
◯ 本アプリケーションはユーザーの個人データを一切収集しません
◯ ユーザーが設定画面で明示的に有効化したAIサービス、またはユーザー自身が設定したAPI経由で利用するサービスにおけるデータ取り扱いについては、当開発者は一切の関知をしません。これら外部サービスの利用はユーザー自身の責任において行ってください

### 🇨🇳 中文
◯ 本应用不会收集任何用户个人信息
◯ 对用户在设置中主动启用的AI服务，或通过用户自定义API接口调用的服务，开发者不承担任何责任亦不参与相关管理，由此产生的数据处理行为及风险均由用户自行承担

### 🇺🇸 English

◯ This application does NOT collect any user data
◯ The developer is not responsible for data handling by AI services explicitly enabled in settings or third-party APIs configured by users. Use of these services is at users' own discretion
