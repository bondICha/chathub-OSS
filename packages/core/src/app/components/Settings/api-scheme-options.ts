import { CustomApiProvider } from '~services/user-config'

export type ApiSchemeOption = {
  name: string
  value: CustomApiProvider
  recommended?: boolean
  outputType?: 'text' | 'image'
}

export function getApiSchemeOptions(): ApiSchemeOption[] {
  return [
    { name: 'OpenAI Compatible (Completion)', value: CustomApiProvider.OpenAI, outputType: 'text' },
    { name: 'OpenRouter (Chat / Image)', value: CustomApiProvider.OpenRouter, outputType: 'text' },
    { name: 'OpenAI Responses API (Beta)', value: CustomApiProvider.OpenAI_Responses, outputType: 'text' },
    { name: 'OpenAI Image (gpt-image-1, Beta)', value: CustomApiProvider.OpenAI_Image, outputType: 'image' },
    { name: 'Image Agent (Generate + Agentic Chatbot)', value: CustomApiProvider.ImageAgent, outputType: 'text' },
    { name: 'Anthropic Claude API', value: CustomApiProvider.Anthropic, outputType: 'text' },
    { name: 'AWS Bedrock (Anthropic)', value: CustomApiProvider.Bedrock, outputType: 'text' },
    { name: 'Google Gemini (OpenAI Format)', value: CustomApiProvider.GeminiOpenAI, outputType: 'text' },
    { name: 'Qwen (OpenAI Format)', value: CustomApiProvider.QwenOpenAI, outputType: 'text' },
    { name: 'Google Gemini API', value: CustomApiProvider.Google, recommended: true, outputType: 'text' },
    { name: 'VertexAI (Claude)', value: CustomApiProvider.VertexAI_Claude, outputType: 'text' },
    { name: 'VertexAI (Gemini, Deprecated - Use Google Gemini API)', value: CustomApiProvider.VertexAI_Gemini, outputType: 'text' },
    // Image-only providers (used via Image Agent, not as direct chatbots)
    { name: 'Chutes AI (Image)', value: CustomApiProvider.ChutesAI, outputType: 'image' },
    { name: 'Novita AI (Image)', value: CustomApiProvider.NovitaAI, outputType: 'image' },
    { name: 'Replicate (Image)', value: CustomApiProvider.Replicate, recommended: true, outputType: 'image' },
  ]
}
