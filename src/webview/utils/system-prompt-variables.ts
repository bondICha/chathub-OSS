/**
 * System prompt template variable replacement utility
 */

export interface SystemPromptVariables {
  current_date: string
  current_time: string
  modelname: string
  chatbotname: string
  language: string
  timezone: string
  web_search_instructions?: string
}

/**
 * Replace template variables in system prompt
 * @param systemMessage - The system message with template variables
 * @param variables - The variables to replace
 * @returns The system message with variables replaced
 */
export function replaceSystemPromptVariables(
  systemMessage: string,
  variables: Partial<SystemPromptVariables>
): string {
  let result = systemMessage

  // Replace each variable if provided
  if (variables.current_date) {
    result = result.replace(/\{current_date\}/g, variables.current_date)
  }
  
  if (variables.current_time) {
    result = result.replace(/\{current_time\}/g, variables.current_time)
  }
  
  if (variables.modelname) {
    result = result.replace(/\{modelname\}/g, variables.modelname)
  }
  
  if (variables.chatbotname) {
    result = result.replace(/\{chatbotname\}/g, variables.chatbotname)
  }
  
  if (variables.language) {
    result = result.replace(/\{language\}/g, variables.language)
  }
  
  if (variables.timezone) {
    result = result.replace(/\{timezone\}/g, variables.timezone)
  }
  
  if (variables.web_search_instructions) {
    result = result.replace(/\{web_search_instructions\}/g, variables.web_search_instructions)
  }

  return result
}

/**
 * Get current date and time strings
 */
export function getCurrentDateTime() {
  const now = new Date()
  return {
    current_date: now.toISOString().split('T')[0], // YYYY-MM-DD format
    current_time: now.toTimeString().split(' ')[0], // HH:MM:SS format
  }
}

/**
 * Get user's language and timezone
 */
export function getUserLocaleInfo() {
  // First try to get app's language setting from localStorage, then fallback to browser language
  const appLanguage = localStorage.getItem('language')
  const language = appLanguage || navigator.language || 'en'  // App setting -> Browser -> Default to English
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'  // Default to UTC
  return {
    language,
    timezone,
  }
}

