import './theme'
import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { perfMark } from '~utils/perf'
perfMark('main.tsx start')
import '../services/sentry'
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
import { rpc } from '~platform/rpc-client'

function App() {
  const setPendingSearchQuery = useSetAtom(pendingSearchQueryAtom)

  // フォント設定を適用
  useFontType()
  useCleanCopy()

  useEffect(() => {
    // Quick Ask コマンド（Chrome拡張の omnibox 相当）からのクエリを受け取る
    const pending = rpc.getInitPayload().pendingQuery
    if (pending && pending.trim() !== '') {
      setPendingSearchQuery(pending)
      void markOmniboxSearchAsUsed()
    }

    const onQuickAsk = (query: string) => {
      void router.navigate({ to: '/' })
      setPendingSearchQuery(query)
      void markOmniboxSearchAsUsed()
    }
    const onNavigate = (route: string) => {
      void router.navigate({ to: route })
    }
    const onThemeChanged = () => {
      // VS Code テーマ変更時、Auto モードなら追従（body の vscode-* クラスを参照）
      applyThemeMode(getUserThemeMode())
    }
    rpc.quickAskListeners.add(onQuickAsk)
    rpc.routeNavigateListeners.add(onNavigate)
    rpc.themeChangeListeners.add(onThemeChanged)
    return () => {
      rpc.quickAskListeners.delete(onQuickAsk)
      rpc.routeNavigateListeners.delete(onNavigate)
      rpc.themeChangeListeners.delete(onThemeChanged)
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
  rpc.post({ type: 'state.route', route: toLocation.pathname })
})

const container = document.getElementById('app')!
const root = createRoot(container)
root.render(<App />)
