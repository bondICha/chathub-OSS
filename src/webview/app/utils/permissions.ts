// VS Code 拡張にはホストパーミッションの概念がないため常に許可される。
// 呼び出し側（各ボット実装）を無改造で使うためのスタブ。
export async function requestHostPermissions(_hosts: string[]) {
  return true
}

export async function requestHostPermission(_host: string) {
  return true
}
