# HuddleLLM for VS Code

複数の AI API（OpenAI / Anthropic / Google Gemini / AWS Bedrock / Vertex AI / OpenRouter ほか）と同時にチャットできる HuddleLLM の VS Code 拡張版です。Chrome 拡張版 [HuddleLLM](https://github.com/bondICha/HuddleLLM---Chat-with-multiple-AI-API-together) からの移植です。

## 機能

- **All-in-One チャット**: 1 / 2 / 3 / 4 / 6 分割レイアウトで複数ボットに同時送信
- **カスタム API チャットボット**（最大 50 個）: OpenAI 互換 / Anthropic / Gemini / Bedrock / Vertex / Perplexity / 画像生成
- **チャット履歴**: セッションスナップショット、全文検索、復元
- **プロンプトライブラリ / Web アクセスエージェント / 音声入力（Whisper）**
- **テーマ**: ライト / ダーク / 自動（VS Code のテーマに追従）
- **i18n**: 日本語 / English / 简体中文 / 繁體中文
- **API キーは VS Code SecretStorage に保存**（平文でディスクに残りません）

## 使い方

| 操作 | 方法 |
|---|---|
| チャットを開く | `Alt+J` または コマンドパレット → `HuddleLLM: Open Chat` |
| サイドバーで開く | アクティビティバーの HuddleLLM アイコン |
| 設定 | `HuddleLLM: Open Settings`（ボット・プロバイダ設定はアプリ内設定画面で行います） |
| 履歴 | `HuddleLLM: Open History` |
| クイック質問 | `HuddleLLM: Quick Ask`（Chrome 版の omnibox `hl` 相当） |

初回はアプリ内の設定画面（歯車アイコン）で API プロバイダと API キーを登録してください。

## アーキテクチャ

- `src/extension/` — 拡張ホスト（Node）。Webview 生成、fetch プロキシ（CORS 回避）、ストレージ（`globalStorageUri` の JSON ファイル + `globalState` + `SecretStorage`）
- `src/webview/` — Chrome 版から移植した React アプリ。`platform/` が Chrome API の互換シム（`webextension-polyfill` の差し替え、`globalThis.fetch` のプロキシ化、localStorage ミラー）
- `src/shared/protocol.ts` — ホスト⇔Webview のメッセージ型定義

## 開発

```bash
npm install
npm run build        # 型チェック + webview (Vite) + ホスト (esbuild)
```

VS Code でこのフォルダを開き `F5` で Extension Development Host を起動して動作確認します。
Webview のデバッグは「Developer: Open Webview Developer Tools」。

```bash
npm run watch:webview    # Vite watch
npm run watch:extension  # esbuild watch
npx vsce package         # VSIX 作成
```
