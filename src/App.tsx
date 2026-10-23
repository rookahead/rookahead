import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { faviconUrl } from './components/RookLogo'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useOnline } from './hooks/useOnline'
import { openAccountPage, startAccounts, useAccount } from './lib/account'
import { BoardPrefsContext } from './lib/boardPrefs'
import { regradeStale } from './lib/regrade'
import { titleFor } from './lib/pageMeta'
import { navigate, usePathname, useRoute, type Route } from './lib/router'
import { useSettings } from './lib/settings'
import { useStoreVersion } from './lib/syncBus'
import { AnalysisPage } from './pages/Analysis'
import { AuthPage } from './pages/Auth'
import { GamesPage } from './pages/Games'
import { HomePage } from './pages/Home'
import { LegendaryPage } from './pages/Legendary'
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
  const { highlightLastMove, showLegalMoves, animation, notation, moveEffects, soundVolume, palette } = settings
  const boardPrefs = useMemo(
    () => ({ highlightLastMove, showLegalMoves, animation, notation, moveEffects, soundVolume, palette }),
    [highlightLastMove, showLegalMoves, animation, notation, moveEffects, soundVolume, palette],
  )
  const route = useRoute()
  const pathname = usePathname()
  // The tab says which page this is (pageMeta.ts; the same titles search engines get).
  useEffect(() => {
    document.title = titleFor(pathname)
  }, [pathname])
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
  const online = useOnline()
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance === 'black' ? 'dark' : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.palette = settings.palette
    // Black is the dark theme on a true black page (index.css, :root[data-black]).
    root.toggleAttribute('data-black', settings.appearance === 'black')
    root.dataset.side = phone || !appRoute ? 'none' : rail ? 'rail' : 'sidebar'
    // The browser's (and an installed app's) bars take the page's own background, and the tab's icon your colour.
    const css = getComputedStyle(root)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', css.getPropertyValue('--bg').trim())
    document.querySelector('link[rel="icon"]')?.setAttribute('href', faviconUrl(css.getPropertyValue('--brand').trim(), css.getPropertyValue('--brand-ink').trim()))
  }, [theme, settings.appearance, settings.palette, phone, rail, appRoute])

  useEffect(() => void startAccounts(), [])

  // Saved reviews follow the verdict rules: any graded under older ones (here, or synced in) are graded again.
  const reviewsVersion = useStoreVersion('reviews')
  useEffect(() => void regradeStale(), [reviewsVersion])

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
          />}
        <div className="shell-page">
          {!online && (
            <p className="offline-bar" role="status">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18" />
              </svg>
              You’re offline. Saved games still work.
            </p>
          )}
          {appRoute === 'home' && <HomePage settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />}
          {appRoute === 'games' && (
            <GamesPage settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} onOpenSettings={() => navigate('/settings/linked')} />
          )}
          {appRoute === 'legendary' && <LegendaryPage settings={settings} onOpenAnalysis={openAnalysis} />}
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
