// VS Code 版ではホストパーミッションは不要（拡張ホスト側 fetch に制限がない）。
// Chrome 版と同じエクスポート面を保つためのスタブ。
export async function requestHostPermissions(_configs: unknown, _providerConfigs?: unknown): Promise<boolean> {
  return true
}
