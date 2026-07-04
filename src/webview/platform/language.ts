import i18n from '~app/i18n'
import { getLanguage } from '~services/storage/language'

/**
 * When the user hasn't picked a language in the app settings, default to the
 * VS Code display language instead of the webview's navigator locale.
 */
export function applyVsCodeLanguageDefault(vscodeLanguage: string): void {
  if (getLanguage()) return
  const lang = vscodeLanguage.toLowerCase()
  let mapped: string
  if (lang.startsWith('ja')) {
    mapped = 'ja'
  } else if (lang === 'zh-tw' || lang === 'zh-hk' || lang.startsWith('zh-hant')) {
    mapped = 'zh-TW'
  } else if (lang.startsWith('zh')) {
    mapped = 'zh-CN'
  } else {
    mapped = 'en'
  }
  void i18n.changeLanguage(mapped)
}
