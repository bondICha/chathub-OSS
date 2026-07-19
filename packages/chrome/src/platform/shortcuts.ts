import Browser from 'webextension-polyfill'

export function openShortcutSettings(): void {
  void Browser.tabs.create({ url: 'chrome://extensions/shortcuts' })
}
