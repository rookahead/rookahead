import { useEffect, useLayoutEffect, useState } from 'react'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { UserCard } from './components/UserCard'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { navigate, useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { AnalysisPage } from './pages/Analysis'
import { HomePage } from './pages/Home'
import { PlayPage } from './pages/Play'
import { PuzzlesPage } from './pages/Puzzles'

/** Whether the sidebar stays expanded on the Analysis page (it's a rail there by default). */
const SIDEBAR_KEY = 'rookahead.sidebar'

const readExpanded = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'expanded'
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
  const [expandOnAnalysis, setExpandOnAnalysis] = useState(readExpanded)
  // Analysis mounts on first visit and then stays, hidden, so a running review or a loaded game
  // survives a trip to Home. Opening a game from Home remounts it (new key) to read that game.
  const [analysisMounted, setAnalysisMounted] = useState(route === 'analysis')
  const [analysisKey, setAnalysisKey] = useState(0)
  if (route === 'analysis' && !analysisMounted) setAnalysisMounted(true)
  // Play also stays mounted once visited, so a game keeps going (and the computer keeps moving) elsewhere.
  const [playMounted, setPlayMounted] = useState(route === 'play')
  if (route === 'play' && !playMounted) setPlayMounted(true)

  const board = route === 'analysis' || route === 'play' || route === 'puzzles'
  const rail = board && !expandOnAnalysis
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance
  // Layout effect, so the first paint already has the right colours and widths.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.side = phone ? 'none' : rail ? 'rail' : 'sidebar'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7f8' : '#0b0b0c')
  }, [theme, phone, rail])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  const toggleRail = () => {
    setExpandOnAnalysis((expanded) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, expanded ? 'rail' : 'expanded')
      } catch {
        // Not remembered; fine.
      }
      return !expanded
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
    <button className="user-avatar guest header-avatar" onClick={toggleSettings} aria-label="Settings">
      ?
    </button>
  ) : undefined

  return (
    <div className="shell">
      {!phone && <Sidebar route={route} rail={rail} onToggleRail={board ? toggleRail : undefined} footer={userCard} />}
      <div className="shell-page">
        {route === 'home' && <HomePage avatar={avatar} boardTheme={settings.boardTheme} onOpenAnalysis={openAnalysis} />}
        {route === 'puzzles' && <PuzzlesPage settings={settings} avatar={avatar} onOpenAnalysis={openAnalysis} />}
        {playMounted && (
          <div className="page-host" hidden={route !== 'play'}>
            <PlayPage active={route === 'play'} settings={settings} avatar={avatar} onOpenAnalysis={openAnalysis} />
          </div>
        )}
        {analysisMounted && (
          <div className="analysis-host" hidden={route !== 'analysis'}>
            <AnalysisPage
              key={analysisKey}
              settings={settings}
              updateSettings={updateSettings}
              engine={engine}
              status={status}
              active={route === 'analysis'}
              avatar={avatar}
            />
          </div>
        )}
      </div>
      {phone && <TabBar route={route} />}
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
