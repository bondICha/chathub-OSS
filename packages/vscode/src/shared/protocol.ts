/**
 * Message protocol between the extension host and the webviews.
 * Imported from both `src/extension` (Node) and `src/webview` (browser).
 */

export type WebviewMode = 'app' | 'sidepanel'

/**
 * Storage namespaces. 'local'/'sync'/'session' mirror Browser.storage.*
 * ('session' is host-memory only, shared across webviews); 'ls' mirrors
 * window.localStorage.
 */
export type KvNamespace = 'local' | 'sync' | 'session' | 'ls'

export interface SerializedBodyText {
  kind: 'text'
  text: string
}
export interface SerializedBodyBytes {
  kind: 'bytes'
  base64: string
}
export interface SerializedFormDataPart {
  name: string
  /** present for file parts */
  filename?: string
  contentType?: string
  /** file parts carry base64, plain fields carry text */
  base64?: string
  text?: string
}
export interface SerializedBodyFormData {
  kind: 'formdata'
  parts: SerializedFormDataPart[]
}
export type SerializedBody = SerializedBodyText | SerializedBodyBytes | SerializedBodyFormData

export interface SerializedRequestInit {
  method?: string
  headers?: Record<string, string>
  body?: SerializedBody
}

/* ------------------------------- webview -> host ------------------------------ */

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'fetch.start'; id: string; url: string; init: SerializedRequestInit }
  | { type: 'fetch.abort'; id: string }
  | { type: 'kv.get'; id: string; ns: KvNamespace; keys: string[] | null }
  | { type: 'kv.set'; id: string; ns: KvNamespace; items: Record<string, unknown> }
  | { type: 'kv.remove'; id: string; ns: KvNamespace; keys: string[] }
  | { type: 'kv.clear'; id: string; ns: KvNamespace }
  | { type: 'ui.openExternal'; url: string }
  | { type: 'ui.openPanel'; route: string }
  | { type: 'ui.openKeybindings' }
  /** save dialog + write on the host; answered with kv.result (data unused) */
  | { type: 'ui.saveFile'; id: string; filename: string; base64: string }
  /** open dialog on the host; answered with kv.result { files: [{base64,filename}] } or undefined if cancelled */
  | { type: 'ui.openFile'; id: string; extensions?: string[]; multiple?: boolean }
  | { type: 'state.route'; route: string }

/* ------------------------------- host -> webview ------------------------------ */

export interface InitPayload {
  mode: WebviewMode
  /** vscode.env.language, e.g. "ja", "en", "zh-cn" */
  language: string
  /** 1 = Light, 2 = Dark, 3 = HighContrast, 4 = HighContrastLight */
  colorThemeKind: number
  /** full snapshot of the 'ls' namespace so sync localStorage reads work before RPC */
  lsSnapshot: Record<string, string>
  /** query passed from the Quick Ask command, replaces the Chrome omnibox flow */
  pendingQuery?: string
  /** hash route to navigate to right after mount (settings/history/btw panels) */
  initialRoute?: string
  /** extension version from package.json */
  version: string
}

export interface KvChange {
  key: string
  oldValue?: unknown
  newValue?: unknown
}

export type HostToWebviewMessage =
  | { type: 'init'; payload: InitPayload }
  | { type: 'fetch.meta'; id: string; status: number; statusText: string; headers: [string, string][] }
  | { type: 'fetch.chunk'; id: string; base64: string }
  | { type: 'fetch.done'; id: string }
  | { type: 'fetch.error'; id: string; name: string; message: string }
  | { type: 'kv.result'; id: string; ok: boolean; data?: Record<string, unknown>; error?: string }
  | { type: 'storage.changed'; ns: KvNamespace; changes: KvChange[] }
  | { type: 'theme.changed'; colorThemeKind: number }
  | { type: 'route.navigate'; route: string }
  | { type: 'quick-ask'; query: string }
