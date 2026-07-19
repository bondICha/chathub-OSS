

export const CHATBOTS_UPDATED_EVENT = 'chatbotsUpdated'


export const CHATGPT_HOME_URL = 'https://chat.openai.com'
export const CHATGPT_API_MODELS = ['gpt-4o', 'gpt-4o-mini', 'o1-mini','o3-mini', 'o1']
export const ALL_IN_ONE_PAGE_ID = 'all'

// Import system prompts from separate file
export { SYSTEM_PROMPTS, getSystemPrompt } from './system-prompts'
export { SYSTEM_PROMPTS as DEFAULT_SYSTEM_MESSAGES } from './system-prompts'

// Default system message (English)
import { SYSTEM_PROMPTS } from './system-prompts'
export const DEFAULT_SYSTEM_MESSAGE = SYSTEM_PROMPTS.en

export type Layout = 'single' | 2 | 3 | 4 | 'twoVertical' | 'twoHorizon' | 'sixGrid' // twoVertical is deprecated
