import './theme'
import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { perfMark } from '~utils/perf'
perfMark('main.tsx start')
import '~services/sentry'
import './base.scss'
import './i18n'
perfMark('i18n loaded')
import { router } from './router'
import { pendingSearchQueryAtom } from './state'
import { markOmniboxSearchAsUsed } from '../services/storage/open-times'
import CompanyProfileModal from './components/Modals/CompanyProfileModal'
import { useFontType } from './hooks/use-font-type'
import { useCleanCopy } from './hooks/use-clean-copy'
import { applyThemeMode } from './utils/color-scheme'
import { getUserThemeMode } from '~services/theme'
import { getAppInitState, onQuickAsk, onNavigate, onThemeChange, reportRoute } from '~platform/app-events'
import { installExternalLinkInterceptor } from '~platform/external-links'

installExternalLinkInterceptor()

function App() {
  const setPendingSearchQuery = useSetAtom(pendingSearchQueryAtom)

  // フォント設定を適用
  useFontType()
  useCleanCopy()

  useEffect(() => {
    let disposed = false

    // 初期ルート（VS Code: openSettings/openHistory コマンド等）と
    // 保留中のクエリ（Chrome: omnibox / VS Code: Quick Ask）を受け取る
    void getAppInitState().then(({ initialRoute, pendingQuery }) => {
      if (disposed) return
      if (initialRoute) {
        void router.navigate({ to: initialRoute })
      }
      if (pendingQuery && pendingQuery.trim() !== '') {
        setPendingSearchQuery(pendingQuery)
        void markOmniboxSearchAsUsed()
      }
    })

    const unsubQuickAsk = onQuickAsk((query) => {
      void router.navigate({ to: '/' })
      setPendingSearchQuery(query)
      void markOmniboxSearchAsUsed()
    })
    const unsubNavigate = onNavigate((route) => {
      void router.navigate({ to: route })
    })
    const unsubTheme = onThemeChange(() => {
      // Auto モードならプラットフォームのテーマ変更に追従
      applyThemeMode(getUserThemeMode())
    })
    return () => {
      disposed = true
      unsubQuickAsk()
      unsubNavigate()
      unsubTheme()
    }
  }, [setPendingSearchQuery])

  return (
    <>
      <RouterProvider router={router} />
      <CompanyProfileModal />
    </>
  )
}

router.subscribe('onResolved', ({ toLocation }) => {
  reportRoute(toLocation.pathname)
})

const container = document.getElementById('app')!
const root = createRoot(container)
root.render(<App />)
