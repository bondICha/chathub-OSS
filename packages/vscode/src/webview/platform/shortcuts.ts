import { rpc } from './rpc-client'

// VS Code のキーボードショートカット設定を開く
export function openShortcutSettings(): void {
  rpc.post({ type: 'ui.openKeybindings' })
}
