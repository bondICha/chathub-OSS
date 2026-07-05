import { createBrowserHistory, parseHref } from '@tanstack/history'
import { createRootRoute, createRoute, createRouter, useParams, Navigate } from '@tanstack/react-router'
import Layout from './components/Layout'
import MultiBotChatPanel from './pages/MultiBotChatPanel'
import SettingPage from './pages/SettingPage'
import SingleBotChatPanel from './pages/SingleBotChatPanel'
import WelcomePage from './pages/WelcomePage'
import HistoryPage from './pages/HistoryPage'
import BtwPage from './pages/BtwPage'

const rootRoute = createRootRoute()

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  component: Layout,
  id: 'layout',
})

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: MultiBotChatPanel,
})

function CustomChatRoute() {
  const { index } = useParams({ from: customChatRoute.id })
  return <SingleBotChatPanel index={parseInt(index, 10)} />
}

const customChatRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'chat/custom/$index',
  component: CustomChatRoute,
})

const settingRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'setting',
  component: SettingPage,
})

const welcomeRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'welcome',
  component: WelcomePage,
})

const historyRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'history',
  component: HistoryPage,
})

// BTW popup window — Layout なしのスタンドアロンページ
const btwRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'btw',
  component: BtwPage,
})

// searchRoute の定義を削除 コメントは不要なので削除
// const searchRoute = createRoute({ ... })

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([indexRoute, customChatRoute, settingRoute, welcomeRoute, historyRoute]),
  btwRoute,
])

/**
 * VS Code Webview は <base href="…"> でバンドルルートを基準にしている。
 * @tanstack/history の createHashHistory は createHref で
 *   `${pathname}${search}#${href}`
 * を返すため、<base> がパスを CDN ルートに書き換えて目的地URLが崩れる。
 *
 * ここでは createBrowserHistory の parseLocation/createHref を
 * ハッシュベースルーティングと同じ挙動に上書きして回避する。
 * parseHref は相対パスを分解するだけなので <base> の影響を受けない。
 * createHref は `#${href}` のsame-document参照のみ返す。
 */
const hashHistory = createBrowserHistory({
  parseLocation: () => {
    const hashSplit = window.location.hash.split('#').slice(1)
    const pathPart = hashSplit[0] ?? '/'
    const searchPart = window.location.search
    const hashEntries = hashSplit.slice(1)
    return parseHref(
      `${pathPart}${searchPart}${hashEntries.length === 0 ? '' : `#${hashEntries.join('#')}`}`,
      window.history.state,
    )
  },
  createHref: (href) => `#${href}`,
})
const router = createRouter({ routeTree, history: hashHistory })

export { router }
