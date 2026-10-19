import { useEffect, useLayoutEffect, useState } from 'react'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TodayCard } from './components/TodayCard'
import { AvatarFace, UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { startAccounts, useAccount } from './lib/account'
import { navigate, useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { AnalysisPage } from './pages/Analysis'
import { AuthPage } from './pages/Auth'
import { GamesPage } from './pages/Games'
import { HomePage } from './pages/Home'
import { PlayPage } from './pages/Play'
import { PuzzlesPage } from './pages/Puzzles'

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
  const { engine, status } = useEngine(settings.engine)
  const route = useRoute()
  const phone = useMediaQuery('(max-width: 1000px)')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { status: accountStatus, account } = useAccount()
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
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.side = phone || auth ? 'none' : rail ? 'rail' : 'sidebar'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7f8' : '#0b0b0c')
  }, [theme, phone, rail, auth])

  useEffect(() => void startAccounts(), [])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

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

  const toggleSettings = () => setSettingsOpen((o) => !o)
  const userCard = <UserCard rail={rail} settingsOpen={settingsOpen} onSettings={toggleSettings} />
  // Phones: the avatar in the page header opens settings.
  const avatar = phone ? (
    <button className={`user-avatar header-avatar ${accountStatus === 'signed-in' ? '' : 'guest'}`} onClick={toggleSettings} aria-label="Settings">
      <AvatarFace account={accountStatus === 'signed-in' ? account : null} />
    </button>
  ) : undefined

  return (
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
          <GamesPage avatar={avatar} settings={settings} updateSettings={updateSettings} onOpenAnalysis={openAnalysis} onOpenSettings={() => setSettingsOpen(true)} />
        )}
        {route === 'puzzles' && <PuzzlesPage settings={settings} avatar={avatar} onOpenAnalysis={openAnalysis} />}
        {playMounted && (
          <div className="page-host" hidden={route !== 'play'}>
            <PlayPage active={route === 'play'} settings={settings} avatar={avatar} onOpenAnalysis={openAnalysis} />
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
      {settingsOpen && (
        <>
          <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} aria-hidden />
          <div className="settings-layer">
            <SettingsPanel
              settings={settings}
              status={status}
              onChange={updateSettings}
              onClose={() => setSettingsOpen(false)}
              crossOriginIsolated={typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated}
            />
          </div>
        </>
      )}
    </div>
  )
}
