import i18n, { Resource } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { getLanguage } from '~services/storage/language'

import apiModule from './locales/api.json'
import attachmentModule from './locales/attachment.json'
import chatModule from './locales/chat.json'
import commonModule from './locales/common.json'
import errorsModule from './locales/errors.json'
import historyModule from './locales/history.json'
import imageModule from './locales/image.json'
import modalsModule from './locales/modals.json'
import releaseNotesModule from './locales/release-notes.json'
import settingsModule from './locales/settings.json'

type LangCode = 'en' | 'ja' | 'zh-CN' | 'zh-TW'
type MultiLangEntry = Record<LangCode, string>
type I18nModule = Record<string, MultiLangEntry>

function buildResources(...modules: I18nModule[]): Resource {
  const langs: LangCode[] = ['en', 'ja', 'zh-CN', 'zh-TW']
  const translations: Record<LangCode, Record<string, string>> = {
    en: {},
    ja: {},
    'zh-CN': {},
    'zh-TW': {},
  }

  for (const module of modules) {
    for (const [key, langMap] of Object.entries(module)) {
      for (const lang of langs) {
        translations[lang][key] = langMap[lang] ?? langMap['en'] ?? key
      }
    }
  }

  return {
    en: { translation: translations['en'] },
    ja: { translation: translations['ja'] },
    'zh-CN': { translation: translations['zh-CN'] },
    'zh-TW': { translation: translations['zh-TW'] },
  }
}

const resources = buildResources(
  commonModule as unknown as I18nModule,
  chatModule as unknown as I18nModule,
  historyModule as unknown as I18nModule,
  settingsModule as unknown as I18nModule,
  apiModule as unknown as I18nModule,
  imageModule as unknown as I18nModule,
  attachmentModule as unknown as I18nModule,
  errorsModule as unknown as I18nModule,
  modalsModule as unknown as I18nModule,
  releaseNotesModule as unknown as I18nModule,
)

export const languageCodes = ['en', 'ja', 'zh-CN', 'zh-TW']

i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    lng: getLanguage(),
    fallbackLng: 'zh-CN',
    resources,
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['navigator'],
      caches: [],
    },
  })

export default i18n
