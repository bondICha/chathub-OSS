/**
 * Auto モードのテーマ判定。ブラウザではプラットフォーム固有の判定はなく、
 * OS の prefers-color-scheme に任せる（undefined を返すと呼び出し側がフォールバック）。
 */
export function detectPlatformDarkPreference(): boolean | undefined {
  return undefined
}
