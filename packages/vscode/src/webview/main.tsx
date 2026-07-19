/**
 * Webview bundle entry for both the main panel and the side view.
 * Order matters: the fetch proxy and localStorage mirror must be in place
 * before any app module runs (theme/i18n read localStorage at import time),
 * so the app is loaded via dynamic import after the init handshake.
 */
import { installFetchProxy } from './platform/fetch-proxy'
import { initLocalStorageMirror } from './platform/local-storage-shim'
import { rpc } from './platform/rpc-client'

installFetchProxy()

async function bootstrap() {
  const payload = await rpc.init()
  initLocalStorageMirror(payload.lsSnapshot)

  const { applyStoredZoom } = await import('./platform/browser-shim')
  applyStoredZoom()

  const { applyVsCodeLanguageDefault } = await import('./platform/language')
  if (payload.mode === 'sidepanel') {
    await import('./app/sidepanel')
  } else {
    await import('./app/main')
  }
  applyVsCodeLanguageDefault(payload.language)
}

void bootstrap()
