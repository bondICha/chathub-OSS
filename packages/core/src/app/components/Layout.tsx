import { Outlet, useLocation } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { Toaster } from 'react-hot-toast'
import { followArcThemeAtom, themeColorAtom, sidebarDisplayModeAtom } from '~app/state'
import ReleaseNotesModal from './Modals/ReleaseNotesModal'
import AiTitlePromptModal from './Modals/AiTitlePromptModal'
import Sidebar from './Sidebar'

function Layout() {
  const themeColor = useAtomValue(themeColorAtom)
  const followArcTheme = useAtomValue(followArcThemeAtom)
  const sidebarDisplayMode = useAtomValue(sidebarDisplayModeAtom)
  const location = useLocation()
  
  // Welcome page allows overflow for scrolling
  const isWelcomePage = location.pathname === '/welcome'
  const overflowClass = isWelcomePage ? 'overflow-y-auto' : 'overflow-hidden'
  
  // Check if it's mobile mode
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 520
  const shouldShowAsHamburger = sidebarDisplayMode === 'hamburger' || (sidebarDisplayMode === 'auto' && isMobile)
  
  return (
    <main
      className={shouldShowAsHamburger ? "h-screen" : "h-screen grid grid-cols-[auto_1fr]"}
      style={{ backgroundColor: followArcTheme ? 'var(--arc-palette-foregroundPrimary)' : themeColor }}
    >
      <Sidebar />
      <div className={`px-[5px] py-1 h-full ${overflowClass}`}>
        <Outlet />
      </div>
      <ReleaseNotesModal />
      <AiTitlePromptModal />
      <Toaster position="bottom-center" />
    </main>
  )
}

export default Layout
