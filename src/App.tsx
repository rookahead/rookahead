import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TodayCard } from './components/TodayCard'
import { AccountMenu } from './components/AccountMenu'
import { AvatarFace, Gear, UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { ACCOUNTS_ENABLED, openAccountPage, startAccounts, useAccount } from './lib/account'
import { BoardPrefsContext } from './lib/boardPrefs'
import { navigate, useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { AnalysisPage } from './pages/Analysis'
import { AuthPage } from './pages/Auth'
import { GamesPage } from './pages/Games'
import { HomePage } from './pages/Home'
import { PlayPage } from './pages/Play'
import { PuzzlesPage } from './pages/Puzzles'
import { SettingsPage } from './pages/Settings'

/** Whether the sidebar is collapsed to a rail ('rail') or full ('expanded', the default), on every page. */
const SIDEBAR_KEY = 'rookahead.sidebar'

const readRail = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'rail'
  } catch {
    return false
  }
}

/** The app shell: settings, the engine (shared by every page), navigation and the current page. */
export default function App() {
  const [settings, updateSettings] = useSettings()
  // A thread count synced from a bigger computer is capped at this device's cores.
  const threads = settings.threads ? Math.min(settings.threads, navigator.hardwareConcurrency || 4) : undefined
  const { engine, status } = useEngine(settings.engine, { threads })
  const { highlightLastMove, showLegalMoves, animation, notation } = settings
  const boardPrefs = useMemo(() => ({ highlightLastMove, showLegalMoves, animation, notation }), [highlightLastMove, showLegalMoves, animation, notation])
  const route = useRoute()
  const phone = useMediaQuery('(max-width: 1000px)')
  const { status: accountStatus, account, needsUsername } = useAccount()
  const [rail, setRail] = useState(readRail)
  // Phones: the account menu, open against the header's avatar.
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])
  // Analysis mounts on first visit and then stays, hidden, so a running review or a loaded game
  // survives a trip to Home. Opening a game from Home remounts it (new key) to read that game.
  // /board (Analyze) is the same page, opened on a clean board.
  const onBoard = route === 'analysis' || route === 'board'
  const [analysisMounted, setAnalysisMounted] = useState(onBoard)
  const [analysisKey, setAnalysisKey] = useState(0)
  if (onBoard && !analysisMounted) setAnalysisMounted(true)
  // Play also stays mounted once visited, so a game keeps going (and the computer keeps moving) elsewhere.
  const [playMounted, setPlayMounted] = useState(route === 'play')
  if (route === 'play' && !playMounted) setPlayMounted(true)

  // The account page has the window to itself: no sidebar or tab bar.
  const auth = route === 'auth'
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.side = phone || auth ? 'none' : rail ? 'rail' : 'sidebar'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f1f1f3' : '#09090a')
  }, [theme, phone, rail, auth])

  useEffect(() => void startAccounts(), [])

  // Signed in without a username (a new Google account lands on the page it was headed for): choose one first.
  useEffect(() => {
    if (accountStatus === 'signed-in' && needsUsername && !auth) openAccountPage('signup')
  }, [accountStatus, needsUsername, auth])

  const toggleRail = () => {
    setRail((was) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, was ? 'expanded' : 'rail')
      } catch {
        // Not remembered; fine.
      }
      return !was
    })
  }

  /** Home has put a game in the session: show it in Analysis. */
  const openAnalysis = () => {
    setAnalysisKey((k) => k + 1)
    navigate('/analysis')
  }

  const openSettings = () => navigate('/settings')
  const userCard = <UserCard rail={rail} settingsOpen={route === 'settings'} onSettings={openSettings} settings={settings} onChange={updateSettings} />
  // Phones: the avatar in the page header opens settings; a guest gets Log in and Sign up beside a gear instead.
  const avatar = !phone ? undefined : ACCOUNTS_ENABLED && accountStatus === 'guest' ? (
    <div className="header-account">
      <button className="btn small ghost" onClick={() => openAccountPage('login')}>
        Log in
      </button>
      <button className="btn small accent-btn header-signup" onClick={() => openAccountPage('signup')}>
        Sign up
      </button>
      <button className="icon-btn user-card-gear" onClick={openSettings} aria-label="Settings" title="Settings">
        <Gear />
      </button>
    </div>
  ) : accountStatus === 'signed-in' ? (
    // Signed in: the avatar opens the account menu (Profile, Settings, Log out).
    <button
      className="user-avatar header-avatar"
      onClick={(e) => {
        const at = e.currentTarget
        setMenuAt((open) => (open ? null : at))
      }}
      aria-haspopup="menu"
      aria-expanded={Boolean(menuAt)}
      aria-label="Account"
    >
      <AvatarFace account={account} />
    </button>
  ) : (
    <button className="user-avatar header-avatar guest" onClick={openSettings} aria-label="Settings">
      <AvatarFace account={null} />
    </button>
  )

  return (
    <BoardPrefsContext.Provider value={boardPrefs}>
      <div className="shell">
        {!phone && !auth && <Sidebar
            route={route}
            rail={rail}
            onToggleRail={toggleRail}
            footer={userCard}
            // Re-read on every page change: what's left to do today moves as you play.
            today={<TodayCard key={route} settings={settings} />}
          />}
        <div className="shell-page">
          {auth && <AuthPage />}
          {route === 'home' && <HomePage avatar={avatar} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />}
          {route === 'games' && (
            <GamesPage avatar={avatar} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} onOpenSettings={() => navigate('/settings/linked')} />
          )}
          {route === 'puzzles' && <PuzzlesPage settings={settings} avatar={avatar} onOpenAnalysis={openAnalysis} />}
          {route === 'settings' && <SettingsPage settings={settings} updateSettings={updateSettings} avatar={avatar} />}
          {playMounted && (
            <div className="page-host" hidden={route !== 'play'}>
              <PlayPage active={route === 'play'} settings={settings} updateSettings={updateSettings} avatar={avatar} onOpenAnalysis={openAnalysis} />
            </div>
          )}
          {analysisMounted && (
            <div className="analysis-host" hidden={!onBoard}>
              <AnalysisPage
                key={analysisKey}
                settings={settings}
                updateSettings={updateSettings}
                engine={engine}
                status={status}
                active={onBoard}
                blank={route === 'board'}
                avatar={avatar}
              />
            </div>
          )}
        </div>
        {phone && !auth && <TabBar route={route} />}
        {menuAt && phone && accountStatus === 'signed-in' && <AccountMenu anchor={menuAt} placement="down" onClose={closeMenu} />}
      </div>
    </BoardPrefsContext.Provider>
  )
}
