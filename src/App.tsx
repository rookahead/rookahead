import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OpenGameDialog } from './components/LoadGameDialog'
import { faviconUrl } from './components/RookLogo'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useOnline } from './hooks/useOnline'
import { transitionsDone } from './hooks/useSettled'
import { finishAppSignIn, openAccountPage, startAccounts, useAccount } from './lib/account'
import { startUsage } from './lib/usage'
import { heldBy, holdBatch } from './lib/batchReview'
import { runningInstalled } from './lib/install'
import { listenForReturns, setBarIcons } from './lib/nativeApp'
import { BoardPrefsContext } from './lib/boardPrefs'
import { regradeStale } from './lib/regrade'
import { titleFor } from './lib/pageMeta'
import { slidesByHand, tabSlide } from './lib/nav'
import { navigate, playerName, routeFor, scrollLeftAt, settingsSection, usePathname, useRoute, type Route } from './lib/router'
import { recentGame } from './lib/session'
import { useSettings } from './lib/settings'
import { useStoreVersion } from './lib/syncBus'
import { AnalysisPage } from './pages/Analysis'
import { AuthPage } from './pages/Auth'
import { BlogPage } from './pages/Blog'
import { HomePage } from './pages/Home'
import { LegendaryPage } from './pages/Legendary'
import { PlayPage } from './pages/Play'
import { ProfilePage } from './pages/Profile'
import { PublicProfilePage } from './pages/PublicProfile'
import { PuzzlesPage } from './pages/Puzzles'
import { SettingsPage } from './pages/Settings'
import { YouPage } from './pages/You'

/** Whether the sidebar is collapsed to a rail ('rail') or full ('expanded', the default), on every page. */
const SIDEBAR_KEY = 'rookahead.sidebar'
/** How long the account page takes to slide in, and out (the .auth-layer animations in index.css). */
const AUTH_ENTER_MS = 600
const AUTH_LEAVE_MS = 420
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

let statusFrame = 0

/**
 * The phone's status bar follows what's under it: the page, or, in the installed app, a tab's top bar once that has
 * filled in (index.css). A browser tab keeps the page's colour, as its own address bar sits between the two.
 */
function paintStatusBar() {
  // Two frames on, so the bar changes with the header drawn under it rather than a moment before.
  cancelAnimationFrame(statusFrame)
  statusFrame = requestAnimationFrame(() => {
    statusFrame = requestAnimationFrame(() => {
      const root = document.documentElement
      const css = getComputedStyle(root)
      const bg = css.getPropertyValue('--bg').trim()
      const brand = css.getPropertyValue('--brand').trim()
      const surface = css.getPropertyValue('--surface').trim()
      const tabHeader = [...document.querySelectorAll<HTMLElement>('.page-header:not(.has-back)')].some((h) => h.offsetParent)
      const filled = root.hasAttribute('data-installed') && root.hasAttribute('data-scrolled') && tabHeader && brand.startsWith('#') && surface.startsWith('#')
      // The same mix as the bar's own background.
      const bar = filled ? channels(surface).map((c, i) => Math.round(c * 0.88 + channels(brand)[i] * 0.12).toString(16).padStart(2, '0')) : null
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar ? `#${bar.join('')}` : bg)
    })
  })
}

/** How long after opening a phone starts drawing the Review tab in the background. */
const GAMES_EARLY_MS = 1500
/** A little longer than the pages' slide (index.css, .page-leaving). */
const SLIDE_MS = 320

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
  // Reviewing many games waits while a page needs the device for its own engine.
  const needsEngine = onBoard || route === 'play' || /^\/puzzles\/mistakes/.test(pathname)
  useEffect(() => holdBatch('page', needsEngine), [needsEngine])
  const [analysisMounted, setAnalysisMounted] = useState(onBoard)
  const [analysisKey, setAnalysisKey] = useState(0)
  if (onBoard && !analysisMounted) setAnalysisMounted(true)
  // Play also stays mounted once visited, so a game keeps going (and the computer keeps moving) elsewhere.
  const [playMounted, setPlayMounted] = useState(route === 'play')
  if (route === 'play' && !playMounted) setPlayMounted(true)

  // Home and My games read your whole history to draw, so they stay mounted too: going back to one just shows it.
  const [homeMounted, setHomeMounted] = useState(route === 'home')
  if (route === 'home' && !homeMounted) setHomeMounted(true)
  const [gamesMounted, setGamesMounted] = useState(route === 'games')
  if (route === 'games' && !gamesMounted) setGamesMounted(true)

  // A phone's Review tab is drawn soon after the app opens, once things are quiet, so even the first tap on it is instant.
  useEffect(() => {
    if (!phone || gamesMounted) return
    const t = setTimeout(() => void transitionsDone().then(() => setGamesMounted(true)), GAMES_EARLY_MS)
    return () => clearTimeout(t)
  }, [phone, gamesMounted])

  // Phones: a tab's top bar fills in once the page has scrolled (index.css, :root[data-scrolled]).
  useEffect(() => {
    if (!phone) return
    const root = document.documentElement
    const mark = () => {
      const scrolled = window.scrollY > 0
      if (scrolled === root.hasAttribute('data-scrolled')) return
      root.toggleAttribute('data-scrolled', scrolled)
      paintStatusBar()
    }
    mark()
    window.addEventListener('scroll', mark, { passive: true })
    return () => {
      window.removeEventListener('scroll', mark)
      root.removeAttribute('data-scrolled')
      paintStatusBar()
    }
  }, [phone])

  // The account page has the window to itself: no sidebar or tab bar.
  const auth = route === 'auth'
  // On the way into the account page, the page you were on stays underneath for a moment while it slides
  // in over it; on the way out, the account page stays on top while it slides away. These are the real
  // elements moving (transform and opacity only), so it runs at the screen's own rate.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [shownRoute, setShownRoute] = useState(route)
  const [under, setUnder] = useState<Route | null>(null)
  const [leaving, setLeaving] = useState(false)
  // A sign-in handed back by the Android app's Chrome tab: the page you were headed for, at once, rather than the
  // account page sliding away over it (it was already showing when the tab closed).
  const [backFromApp, setBackFromApp] = useState(false)
  if (route !== shownRoute) {
    setShownRoute(route)
    if (backFromApp) setBackFromApp(false)
    if (!reducedMotion && auth && shownRoute !== 'auth') setUnder(shownRoute)
    if (!reducedMotion && !backFromApp && !auth && shownRoute === 'auth') {
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

  // Going from one phone tab to another, the page you left stays on screen just long enough to slide away beside
  // the next one (index.css, .page-leaving). These are the real pages, so nothing else on screen has to wait for them.
  const path = usePathname()
  const [slidPath, setSlidPath] = useState(path)
  const [sliding, setSliding] = useState<{ route: Route; slide: 'forward' | 'back'; y: number } | null>(null)
  if (path !== slidPath) {
    setSlidPath(path)
    const slide = phone && !reducedMotion && slidesByHand(slidPath, path) ? tabSlide(slidPath, path) : null
    setSliding(slide ? { route: routeFor(slidPath), slide, y: scrollLeftAt() } : null)
  }
  useEffect(() => {
    if (!sliding) return
    const t = setTimeout(() => setSliding(null), SLIDE_MS)
    return () => clearTimeout(t)
  }, [sliding])
  const slideHost = (page: Route) => {
    const goes = sliding?.route === page
    return {
      hidden: appRoute !== page && !goes,
      className: `page-host ${goes ? `page-leaving ${sliding.slide}` : sliding && appRoute === page ? `page-arriving ${sliding.slide}` : ''}`,
      style: goes ? ({ '--left-at': `${-sliding.y}px` } as CSSProperties) : undefined,
    }
  }
  const online = useOnline()
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance === 'black' ? 'dark' : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.palette = settings.palette
    // Black is the dark theme on a true black page (index.css, :root[data-black]).
    root.toggleAttribute('data-black', settings.appearance === 'black')
    // Opened from the home screen rather than in a browser tab (index.css, the tabs' top bar).
    root.toggleAttribute('data-installed', runningInstalled())
    root.dataset.side = phone || !appRoute ? 'none' : rail ? 'rail' : 'sidebar'
    // The browser's (and an installed app's) bars take the page's own background, and the tab's icon your colour.
    const css = getComputedStyle(root)
    paintStatusBar()
    setBarIcons(theme === 'dark')
    document.querySelector('link[rel="icon"]')?.setAttribute('href', faviconUrl(css.getPropertyValue('--brand').trim(), css.getPropertyValue('--brand-ink').trim()))
  }, [theme, settings.appearance, settings.palette, phone, rail, appRoute])

  useEffect(() => {
    void startAccounts()
    startUsage()
  }, [])
  // The Android app: a sign-in finished in its Chrome tab comes back here.
  useEffect(
    () =>
      listenForReturns((path) => {
        setBackFromApp(true)
        void finishAppSignIn(path)
      }),
    [],
  )

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

  // Game review from the menu: the game you were just on (its review running, or worked on in the last
  // half hour) opens as you left it. Otherwise Load a game opens here, over this page, and only a game
  // loaded there goes to the review; dismissed, you stay where you were.
  const [gameReviewLoad, setGameReviewLoad] = useState(false)
  const onGameReview = () => {
    if (heldBy('review') || recentGame()) return false
    setGameReviewLoad(true)
    return true
  }

  const openSettings = () => navigate('/settings')
  const userCard = <UserCard rail={rail} settingsOpen={route === 'settings'} onSettings={openSettings} settings={settings} onChange={updateSettings} />

  // Phones' You tab is your profile, its settings behind a gear (plain /settings is the phones' list of them);
  // /you, its old address, goes to the profile there and to Settings on desktop.
  useEffect(() => {
    if (route === 'you') navigate(phone ? '/profile' : '/settings', { replace: true })
    // The blog is its own site on desktop (public/blog, built by scripts/build-blog.mjs).
    if (!phone && route === 'blog' && import.meta.env.PROD) location.reload()
  }, [phone, route])

  return (
    <BoardPrefsContext.Provider value={boardPrefs}>
      <div className="shell" hidden={!appRoute}>
        {!phone && appRoute && <Sidebar
            route={appRoute}
            rail={rail}
            onToggleRail={toggleRail}
            footer={userCard}
            onGameReview={onGameReview}
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
          <ErrorBoundary>
            {homeMounted && (
              <div {...slideHost('home')}>
                <HomePage active={appRoute === 'home'} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />
              </div>
            )}
            {gamesMounted && (
              <div {...slideHost('games')}>
                <ProfilePage active={appRoute === 'games'} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} onOpenSettings={() => navigate('/settings/linked')} />
              </div>
            )}
            {appRoute === 'legendary' && <LegendaryPage settings={settings} onOpenAnalysis={openAnalysis} />}
            {appRoute === 'player' && <PublicProfilePage name={playerName(pathname) ?? ''} />}
            {(appRoute === 'puzzles' || sliding?.route === 'puzzles') && (
              <div {...slideHost('puzzles')}>
                <PuzzlesPage leaving={sliding?.route === 'puzzles'} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />
              </div>
            )}
            {appRoute === 'settings' &&
              (phone && !settingsSection(pathname) ? <YouPage settings={settings} updateSettings={updateSettings} /> : <SettingsPage settings={settings} updateSettings={updateSettings} />)}
            {(appRoute === 'blog' || sliding?.route === 'blog') && phone && (
              <div {...slideHost('blog')}>
                <BlogPage settings={settings} />
              </div>
            )}
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
          </ErrorBoundary>
        </div>
        {phone && appRoute && <TabBar route={appRoute} />}
      </div>
      <OpenGameDialog open={gameReviewLoad} onClose={() => setGameReviewLoad(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} />
      {(auth || leaving) && (
        <div className={`auth-layer ${under ? 'entering' : ''} ${leaving ? 'leaving' : ''}`}>
          <AuthPage />
        </div>
      )}
    </BoardPrefsContext.Provider>
  )
}
