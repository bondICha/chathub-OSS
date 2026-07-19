import { ModelInfo } from '../src/services/user-config'

// モデルリストをプロバイダーごとに階層化
export const MODEL_LIST: Record<string, Record<string, string | ModelInfo>> = {
    "OpenAI": {
        "GPT-5.5": "gpt-5.5",
        "GPT-5.5 Pro": "gpt-5.5-pro",
    },
    "Anthropic": {
        "Claude Opus 4.7": "claude-opus-4-7",
        "Claude Sonnet 4.6": "claude-sonnet-4-6",
        "Claude Haiku 4.5": "claude-haiku-4-5",
    },
    "Google": {
        "Gemini 3.1 Pro": "gemini-3.1-pro-preview",
        "Gemini 3.1 Pro Image": "gemini-3-pro-image-preview",
        "Nano Banana2": "gemini-3.1-flash-image-preview",
    },
    "Grok": {
        "Grok 4.20": "grok-4.20",
        "Grok 4.1 Fast": "grok-4-1-fast",
        "Grok 4.1 Fast NR": "grok-4-1-fast-non-reasoning",
        "Grok Code Fast": "grok-code-fast-1",
    },
    "Deepseek": {
        "DeepSeek V4 Pro": "deepseek-v4-pro",
        "DeepSeek V4 Flash": "deepseek-v4-flash",
    },
    "Perplexity": {
        "Sonar Pro": { value: "sonar-pro", icon: "perplexity" },
        "Sonar": { value: "sonar", icon: "perplexity" },
        "Sonar Deep Research": { value: "sonar-deep-research", icon: "perplexity" },
        "Sonar Reasoning Pro": { value: "sonar-reasoning-pro", icon: "perplexity" },
        "Sonar Reasoning": { value: "sonar-reasoning", icon: "perplexity" },
    },
    "Rakuten": {
        "RakutenAI 3.0": "rakutenai-3.0",
        "RakutenAI 7B": "rakutenai-7b",
        "RakutenAI 2.0": "rakutenai-2.0",
        "RakutenAI 2.0 Mini": "rakutenai-2.0-mini",
    },
    "Qwen": {
        // 商用モデル - Tongyiロゴ
        "Qwen3-Max": { value: "qwen3-max", icon: "tongyi" },
        "Qwen3.5-Plus": { value: "qwen3.5-plus", icon: "tongyi" },
        "Qwen3.5-Flash": { value: "qwen3.5-flash", icon: "tongyi" },
        "Qwen-Turbo": { value: "qwen-turbo", icon: "tongyi" },
        "通义千问3-VL-Plus": { value: "qwen3-vl-plus", icon: "tongyi" },
        "通义千问3-VL-Flash": { value: "qwen3-vl-flash", icon: "tongyi" },
        "Qwen-OCR": { value: "qwen-vl-ocr", icon: "tongyi" },
        "Qwen-Coder-Plus": { value: "qwen3-coder-plus", icon: "tongyi" },
        "Qwen-Deep-Research": { value: "qwen-deep-research", icon: "tongyi" },

        // オープンソースモデル - Qianwenロゴ
        "Qwen3.5-397B-A17B": { value: "qwen3.5-397b-a17b", icon: "qianwen" },
        "Qwen3.5-122B-A10B": { value: "qwen3.5-122b-a10b", icon: "qianwen" },

        "通义千问3-VL-235B-A22B-Thinking": { value: "qwen3-vl-235b-a22b-thinking", icon: "qianwen" },
        "通义千问3-VL-235B-A22B-Instruct": { value: "qwen3-vl-235b-a22b-instruct", icon: "qianwen" },
        "Qwen-Coder-480B-A35B-Instruct": { value: "qwen3-coder-480b-a35b-instruct", icon: "qianwen" },
    },
    
    "Custom": {
        // OpenRouter用のGeminiモデル
        "Google Gemini 3 Pro": { value: "google/gemini-3-pro-preview", icon: "gemini" },
        "OpenAI/GPT-OSS-120b": { value: "openai/gpt-oss-120b", icon: "openai" },
        "OpenAI/GPT-OSS-20b": { value: "openai/gpt-oss-20b", icon: "openai" },
        "通义千问/Qwen3.5-397B-A17B": { value: "qwen/qwen3.5-397b-a17b", icon: "qianwen" },
        "通义千问/Qwen3.5-122B-A10B": { value: "qwen/qwen3.5-122b-a10b", icon: "qianwen" },
        "通义千问/Qwen3.5-35B-A3B": { value: "qwen/qwen3.5-35b-a3b", icon: "qianwen" },
        "通义千问/Qwen3 VL 235B A22B Instruct": { value: "qwen/qwen3-vl-235b-a22b-instruct", icon: "qianwen" },
        "通义千问/Qwen3 VL 235B A22B Thinking": { value: "qwen/qwen3-vl-235b-a22b-thinking", icon: "qianwen" },
        "DeepSeek/DeepSeek-V3.2": { value: "deepseek/deepseek-v3.2", icon: "deepseek" },
        "DeepSeek/DeepSeek-V3.2-Exp": { value: "deepseek/deepseek-v3.2-exp", icon: "deepseek" },
        "DeepSeek/DeepSeek-R1": { value: "deepseek/deepseek-r1-0528", icon: "deepseek" },
        "moonshotai/Kimi-K2.6": { value: "moonshotai/kimi-k2.6", icon: "kimi" },
        "moonshotai/Kimi-K2.5": { value: "moonshotai/kimi-k2.5", icon: "kimi" },
        "MiniMax/MiniMax-M2.7": { value: "minimax/minimax-m2.7", icon: "minimax" },
        "Xiaomi/MiMo-V2.5-Pro": { value: "xiaomi/mimo-v2.5-pro", icon: "xiaomi" },
        "Xiaomi/MiMo-V2.5": { value: "xiaomi/mimo-v2.5", icon: "xiaomi" },
        "Xiaomi/MiMo-V2-Pro": { value: "xiaomi/mimo-v2-pro", icon: "xiaomi" },
        // Zhipu AI (z-ai) models
        "GLM-5.1": { value: "z-ai/glm-5.1", icon: "zhipu" },
        "GLM-5V Turbo": { value: "z-ai/glm-5v-turbo", icon: "zhipu" },
        "GLM-5 Turbo": { value: "z-ai/glm-5-turbo", icon: "zhipu" },
        "GLM-5": { value: "z-ai/glm-5", icon: "zhipu" },
        "GLM-4.7 Flash": { value: "z-ai/glm-4.7-flash", icon: "zhipu" },
    },
}
