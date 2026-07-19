import { GeminiApiBot } from '~app/bots/gemini-api';
import { getUserConfig, CustomApiProvider } from './user-config';

export interface TranscribeResult {
  text: string;
  error?: string;
}

export type OpenAIModel = 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' | 'gpt-4o-transcribe-diarize';

/**
 * Transcribe audio using OpenAI API
 */
export async function transcribeWithOpenAI(
  file: File,
  providerId: string,
  model: OpenAIModel
): Promise<TranscribeResult> {
  try {
    // Get user config to resolve API key and host
    const config = await getUserConfig();

    // Find the provider config
    const providerConfig = config.providerConfigs?.find(p => p.id === providerId);

    if (!providerConfig) {
      throw new Error('OpenAI provider configuration not found');
    }

    // Resolve API Key with fallback to common settings (same logic as Gemini)
    const effectiveApiKey =
      (providerConfig.apiKey && providerConfig.apiKey.trim().length > 0)
        ? providerConfig.apiKey
        : config.customApiKey;

    if (!effectiveApiKey || effectiveApiKey.trim().length === 0) {
      throw new Error('API key for OpenAI provider is not configured');
    }

    // Resolve base URL
    const effectiveBaseUrl = providerConfig.host.trim()

    const formData = new FormData();
    formData.append('file', file, file.name); // Explicitly set filename
    formData.append('model', model);
    formData.append('response_format', 'json');

    // Construct URL
    const url = `${effectiveBaseUrl.replace(/\/$/, '')}/audio/transcriptions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${effectiveApiKey}`,
        // Content-Type is set automatically for FormData
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { text: data.text };

  } catch (error) {
    console.error('OpenAI Transcription failed:', error);
    return { 
      text: '', 
      error: error instanceof Error ? error.message : 'Unknown error during transcription' 
    };
  }
}

/**
 * Transcribe audio using Gemini Bot (created from config)
 */
export async function transcribeWithGemini(
  file: File,
  botIndex: number
): Promise<TranscribeResult> {
  try {
    const {
      customApiKey,
      customApiHost,
      customApiConfigs,
      providerConfigs,
    } = await getUserConfig();

    const config = customApiConfigs[botIndex];
    if (!config) {
      throw new Error('Gemini bot configuration not found');
    }

    // Resolve provider reference (if any)
    const providerRef = config.providerRefId
      ? (providerConfigs || []).find((p) => p.id === config.providerRefId)
      : undefined;

    const effectiveProvider =
      providerRef?.provider ??
      (config.provider ||
        (config.model.includes('gemini') ? CustomApiProvider.Google : CustomApiProvider.OpenAI));

    if (
      effectiveProvider !== CustomApiProvider.Google &&
      effectiveProvider !== CustomApiProvider.VertexAI_Gemini
    ) {
      throw new Error('Selected bot is not Gemini-compatible');
    }

    const effectiveHost =
      (providerRef?.host && providerRef.host.trim().length > 0)
        ? providerRef.host
        : (config.host && config.host.trim().length > 0)
          ? config.host
          : customApiHost;

    const effectiveApiKey =
      (providerRef?.apiKey && providerRef.apiKey.trim().length > 0)
        ? providerRef.apiKey
        : (config.apiKey || customApiKey);

    if (!effectiveApiKey || effectiveApiKey.trim().length === 0) {
      throw new Error('API key for Gemini provider is not configured');
    }

    const googleAuthMode = providerRef?.AuthMode || 'header';
    const extraHeaders: Record<string, string> = {};
    if (googleAuthMode === 'header' && effectiveApiKey.trim().length > 0) {
      // Gateway-style auth: raw key in Authorization header
      extraHeaders.Authorization = effectiveApiKey;
    }

    // Resolve Vertex AI mode: Provider setting takes precedence
    const vertexMode = providerRef?.VertexMode ?? config.geminiVertexMode ?? false;

    // For Vertex AI gateways, host is usually a full path
    const baseUrl =
      effectiveHost && effectiveHost.trim().length > 0
        ? effectiveHost
        : undefined;

    // Create a temporary bot instance
    const bot = new GeminiApiBot({
      geminiApiKey: effectiveApiKey,
      geminiApiModel: config.model,
      geminiApiTemperature: 0,
      vertexai: vertexMode,
      baseUrl,  // SDK handles both full paths and base URLs
      extraHeaders,
    });

    let transcribedText = '';
    
    const controller = new AbortController();
    
    // Use the bot's sendMessage capability
    const stream = bot.sendMessage({
      prompt: `Analyze and transcribe this audio/video file. Provide TWO sections:

## Audio Overview
Describe the overall characteristics of the audio:
- Type of content (meeting, lecture, conversation, podcast, etc.)
- Number of speakers and their characteristics (if identifiable)
- Audio quality and recording environment
- Background sounds or ambient noise
- Language(s) spoken
- Tone and atmosphere
- Duration estimate if relevant

## Transcription
Provide detailed transcription with these requirements:

CRITICAL: TRANSCRIBE IN ORIGINAL LANGUAGE(S) ONLY
1. Language: Write EXACTLY what is spoken in its ORIGINAL language
   - Keep each sentence/phrase in the language it was spoken
   - If multiple languages are used, preserve each in its original form
   - NEVER add translations, explanations, or parenthetical notes from your understanding other than what is spoken
   - NEVER add "(Translation:" or "Translation context" annotations
   - NEVER convert or translate ANY spoken content

2. Content: Include all spoken dialogue verbatim (word-for-word)
3. Speakers: Label speakers (e.g., "Speaker 1:", "Speaker 2:", or use names/roles if mentioned)
4. Non-speech: Include relevant sound effects or background noises in [brackets]
5. Timestamps: Add timestamps (MM:SS format) for longer content or when helpful for context
6. Video: If video file, note important visual elements at relevant timestamps

Output format:
- Use exactly these two section headers: "## Audio Overview" and "## Transcription"
- Start directly with content, no introductory remarks
- Use clear formatting with line breaks between speakers or topics
- ABSOLUTELY NO TRANSLATIONS OR LANGUAGE CONVERSIONS`,
      audioFiles: [file],
      signal: controller.signal
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        transcribedText = chunk.text;
      }
    }

    return { text: transcribedText };

  } catch (error) {
    console.error('Gemini Transcription failed:', error);
    return { 
      text: '', 
      error: error instanceof Error ? error.message : 'Unknown error during transcription' 
    };
  }
}
