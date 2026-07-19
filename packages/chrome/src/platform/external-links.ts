// ブラウザでは <a target="_blank"> がそのまま機能するため何もしない。
// (VS Code 版は webview 内のリンククリックをホストの openExternal へ委譲する)
export function installExternalLinkInterceptor(): void {}
