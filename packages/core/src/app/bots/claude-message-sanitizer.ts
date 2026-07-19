/**
 * Message sanitizer for Claude-family bots (Anthropic API, Vertex AI Claude, Bedrock Claude).
 * Provides utilities to validate and sanitize messages before sending to Claude APIs.
 */

export const CLAUDE_EMPTY_PLACEHOLDER = '[EMPTY MESSAGE]';

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Ensures text content is not empty for Claude API compatibility.
 * @param value Input text to validate
 * @returns Non-empty text or placeholder
 */
export function ensureNonEmptyText(value: unknown): string {
  return isNonEmptyText(value) ? (value as string) : CLAUDE_EMPTY_PLACEHOLDER;
}

export type ClaudeMessagePart =
  | { type: 'text'; text?: string }
  | { text?: string }
  | Record<string, any>;

/**
 * Sanitizes messages to be compatible with Claude-like APIs.
 * Handles multiple message formats:
 * - content: string
 * - content: Array<{ type: 'text' | 'image' | ...; text?: string; ... }>
 * - Bedrock-style parts: Array<{ text?: string } | { image?: {...} }>
 */
export function sanitizeMessagesForClaude<T extends { content: any }>(messages: T[]): T[] {
  return messages.map((m) => {
    const c = (m as any).content;

    if (typeof c === 'string') {
      return { ...m, content: ensureNonEmptyText(c) } as T;
    }

    if (Array.isArray(c)) {
      const newParts = c.map((part: any) => {
        if (part && typeof part === 'object') {
          // Anthropic/Vertex style text part: { type: 'text', text: string }
          if ((part as any).type === 'text') {
            return { ...part, text: ensureNonEmptyText((part as any).text) };
          }
          // Bedrock style text part: { text: string } (no type property)
          if (!('type' in part) && 'text' in part) {
            return { ...part, text: ensureNonEmptyText((part as any).text) };
          }
        }
        return part;
      });
      return { ...m, content: newParts } as T;
    }

   return m;
  });
}