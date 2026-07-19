export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }

export type ChatMessage =
  | {
      role: 'system' | 'assistant'
      content: string
    }
  | {
      role: 'user'
      content: string | ContentPart[]
    }
