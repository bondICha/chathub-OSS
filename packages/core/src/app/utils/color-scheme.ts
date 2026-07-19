import { ThemeMode } from '~services/theme'
import { detectPlatformDarkPreference } from '~platform/color-scheme'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function light() {
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  document.documentElement.setAttribute('data-theme', 'light')
  document.documentElement.style.setProperty('--theme-color', '#7EB8D6FF');
  document.documentElement.style.setProperty('--theme-color-muted', '#7EB8D633'); // 20% opacity
}

function dark() {
  document.documentElement.classList.remove('light')
  document.documentElement.classList.add('dark')
  document.documentElement.setAttribute('data-theme', 'dark')
  document.documentElement.style.setProperty('--theme-color', '#7EB8D6FF');
  document.documentElement.style.setProperty('--theme-color-muted', '#7EB8D633'); // 20% opacity
}

function isSystemDarkMode() {
  // Auto モードはプラットフォーム側のテーマ（VS Code のテーマ等）を優先し、
  // 判定できない場合のみ OS の配色設定に従う
  const platformPreference = detectPlatformDarkPreference()
  if (platformPreference !== undefined) {
    return platformPreference
  }
  return !!window.matchMedia(COLOR_SCHEME_QUERY).matches
}

function colorSchemeListener(e: MediaQueryListEvent) {
  const colorScheme = e.matches ? 'dark' : 'light'
  if (colorScheme === 'dark') {
    dark()
  } else {
    light()
  }
}

function applyThemeMode(mode: ThemeMode) {
  if (mode === ThemeMode.Light) {
    light()
    window.matchMedia(COLOR_SCHEME_QUERY).removeEventListener('change', colorSchemeListener)
    return
  }

  if (mode === ThemeMode.Dark) {
    dark()
    window.matchMedia(COLOR_SCHEME_QUERY).removeEventListener('change', colorSchemeListener)
    return
  }

  if (isSystemDarkMode()) {
    dark()
  } else {
    light()
  }

  window.matchMedia(COLOR_SCHEME_QUERY).addEventListener('change', colorSchemeListener)
}

function getDefaultThemeColor() {
  return '#7EB8D6FF'
}

export { applyThemeMode, getDefaultThemeColor, isSystemDarkMode }
