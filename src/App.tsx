import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TodayCard } from './components/TodayCard'
import { UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { openAccountPage, startAccounts, useAccount } from './lib/account'
import { BoardPrefsContext } from './lib/boardPrefs'
import { navigate, useRoute, type Route } from './lib/router'
import { useSettings } from './lib/settings'
import { AnalysisPage } from './pages/Analysis'
import { AuthPage } from './pages/Auth'
import { GamesPage } from './pages/Games'
import { HomePage } from './pages/Home'
import { PlayPage } from './pages/Play'
import { PuzzlesPage } from './pages/Puzzles'
import { SettingsPage } from './pages/Settings'
import { YouPage } from './pages/You'

/** Whether the sidebar is collapsed to a rail ('rail') or full ('expanded', the default), on every page. */
const SIDEBAR_KEY = 'rookahead.sidebar'
/** How long the account page takes to slide in, and out (the .auth-layer animations in index.css). */
const AUTH_ENTER_MS = 600
const AUTH_LEAVE_MS = 420

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
  const { status: accountStatus, needsUsername } = useAccount()
  const [rail, setRail] = useState(readRail)
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
  // On the way into the account page, the page you were on stays underneath for a moment while it slides
  // in over it; on the way out, the account page stays on top while it slides away. These are the real
  // elements moving (transform and opacity only), so it runs at the screen's own rate.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [shownRoute, setShownRoute] = useState(route)
  const [under, setUnder] = useState<Route | null>(null)
  const [leaving, setLeaving] = useState(false)
  if (route !== shownRoute) {
    setShownRoute(route)
    if (!reducedMotion && auth && shownRoute !== 'auth') setUnder(shownRoute)
    if (!reducedMotion && !auth && shownRoute === 'auth') {
      setUnder(null)
      setLeaving(true)
    }
  }
  useEffect(() => {
    if (!under) return
    const t = setTimeout(() => setUnder(null), AUTH_ENTER_MS)
    return () => clearTimeout(t)
  }, [under])
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), AUTH_LEAVE_MS)
    return () => clearTimeout(t)
  }, [leaving])
  // The app page on screen: none once the account page has fully arrived.
  const appRoute = auth ? under : route
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance === 'dim' ? 'dark' : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.palette = settings.palette
    // Dim is the dark theme with lighter greys (index.css, :root[data-dim]).
    root.toggleAttribute('data-dim', settings.appearance === 'dim')
    root.dataset.side = phone || !appRoute ? 'none' : rail ? 'rail' : 'sidebar'
    // The browser's (and an installed app's) bars take the page's own background.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim())
  }, [theme, settings.appearance, settings.palette, phone, rail, appRoute])

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

  // You (/you) is the phones' tab for your profile and settings; desktop has the sidebar's user card and Settings.
  // Phones' plain /settings list is the You page too.
  useEffect(() => {
    if (!phone && route === 'you') navigate('/settings', { replace: true })
    if (phone && location.pathname.replace(/\/$/, '') === '/settings') navigate('/you', { replace: true })
  }, [phone, route])

  return (
    <BoardPrefsContext.Provider value={boardPrefs}>
      <div className="shell" hidden={!appRoute}>
        {!phone && appRoute && <Sidebar
            route={appRoute}
            rail={rail}
            onToggleRail={toggleRail}
            footer={userCard}
            // Re-read on every page change: what's left to do today moves as you play.
            today={<TodayCard key={appRoute} settings={settings} />}
          />}
        <div className="shell-page">
          {appRoute === 'home' && <HomePage settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />}
          {appRoute === 'games' && (
            <GamesPage settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} onOpenSettings={() => navigate('/settings/linked')} />
          )}
          {appRoute === 'puzzles' && <PuzzlesPage settings={settings} onOpenAnalysis={openAnalysis} />}
          {appRoute === 'settings' && <SettingsPage settings={settings} updateSettings={updateSettings} />}
          {appRoute === 'you' && phone && <YouPage settings={settings} updateSettings={updateSettings} />}
          {playMounted && (
            <div className="page-host" hidden={appRoute !== 'play'}>
              <PlayPage active={route === 'play'} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />
            </div>
          )}
          {analysisMounted && (
            <div className="analysis-host" hidden={appRoute !== 'analysis' && appRoute !== 'board'}>
              <AnalysisPage
                key={analysisKey}
                settings={settings}
                updateSettings={updateSettings}
                engine={engine}
                status={status}
                active={onBoard}
                blank={route === 'board'}
               
              />
            </div>
          )}
        </div>
        {phone && appRoute && <TabBar route={appRoute} />}
      </div>
      {(auth || leaving) && (
        <div className={`auth-layer ${under ? 'entering' : ''} ${leaving ? 'leaving' : ''}`}>
          <AuthPage />
        </div>
      )}
    </BoardPrefsContext.Provider>
  )
}
