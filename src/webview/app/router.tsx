import { createHashHistory, createRootRoute, createRoute, createRouter, useParams, Navigate } from '@tanstack/react-router'
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

const hashHistory = createHashHistory()
const router = createRouter({ routeTree, history: hashHistory })

export { router }
