import Browser from 'webextension-polyfill'
import { compareVersions } from 'compare-versions'

export async function getAppOpenTimes() {
  const { openTimes = 0 } = await Browser.storage.sync.get('openTimes')
  return openTimes
}

export async function incrAppOpenTimes() {
  const { lastCheckReleaseNotesVersion } = await Browser.storage.sync.get('lastCheckReleaseNotesVersion')
  const openTimes = await getAppOpenTimes()
  
  // Reset open times for users upgrading from version < 2.10.0 to enable company profile checking
  if (lastCheckReleaseNotesVersion && 
    compareVersions(lastCheckReleaseNotesVersion, '2.10.0') < 0) {
    Browser.storage.sync.set({ openTimes: 1 })
    return 1
  }
  
  Browser.storage.sync.set({ openTimes: openTimes + 1 })
  return openTimes + 1
}

export async function getPremiumModalOpenTimes() {
  const { premiumModalOpenTimes = 0 } = await Browser.storage.sync.get('premiumModalOpenTimes')
  return premiumModalOpenTimes
}

export async function incrPremiumModalOpenTimes() {
  const openTimes = await getPremiumModalOpenTimes()
  Browser.storage.sync.set({ premiumModalOpenTimes: openTimes + 1 })
  return openTimes + 1
}

export async function hasUsedOmniboxSearch() {
  const { hasUsedOmniboxSearch = false } = await Browser.storage.sync.get('hasUsedOmniboxSearch')
  return hasUsedOmniboxSearch
}

export async function markOmniboxSearchAsUsed() {
  Browser.storage.sync.set({ hasUsedOmniboxSearch: true })
}

export async function shouldShowAddressBarModal() {
  const hasUsed = await hasUsedOmniboxSearch()
  const openTimes = await getAppOpenTimes()
  // 20回目以降の起動で、まだ使用していない場合に表示
  return !hasUsed && openTimes >= 20
}

export async function markAddressBarModalAsShown() {
  // モーダルを閉じただけでは何もしない（実際に使用するまで表示し続ける）
}

export async function markAddressBarModalAsDisabled() {
  // 「もう表示しない」を選択した場合
  Browser.storage.sync.set({ hasUsedOmniboxSearch: true })
}
