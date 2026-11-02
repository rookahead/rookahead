import { useEffect, useState, type CSSProperties } from 'react'
import { useMistakes } from '../hooks/useMistakes'
import { useAccount } from '../lib/account'
import { PHONE_ACTIONS, PHONE_TABS } from '../lib/nav'
import { loadProgress } from '../lib/puzzleStore'
import { isPuzzleHub, type Route } from '../lib/router'
import { Link } from './Link'
import { TAB_ICONS } from './Tabs'
import { AvatarFace } from './UserCard'

/** Phone navigation along the bottom of the screen. Your photo, when you've uploaded one, is the You tab's icon. */
export function TabBar({ route }: { route: Route }) {
  const { account, avatarUrl } = useAccount()
  // A tab lights up at the touch, not when its page has opened, so a page that takes a moment still answers at once.
  const [pressed, setPressed] = useState<string | null>(null)
  // Puzzles' menu of modes, open over the page.
  const [modes, setModes] = useState(false)
  useEffect(() => {
    setPressed(null)
    setModes(false)
  }, [route])
  const action = PHONE_ACTIONS[route]
  const puzzles = route === 'puzzles' && isPuzzleHub(location.pathname)
  const lit = PHONE_TABS.findIndex((tab) => (pressed ? pressed === tab.id : tab.routes.includes(route)))
  return (
    <>
    {modes && <div className="tabbar-backdrop" onClick={() => setModes(false)} aria-hidden />}
    <nav className="tabbar" aria-label="Main">
      {/* The page's big button sits in the bar itself, above the tabs, so it stays put when pages slide. */}
      {puzzles && <PuzzleActions open={modes} onToggle={() => setModes((o) => !o)} />}
      {action?.to && (
        <Link to={action.to} className="btn accent-btn tabbar-play">
          {action.label}
        </Link>
      )}
      {action?.event && (
        <button className="btn accent-btn tabbar-play" onClick={() => window.dispatchEvent(new Event(action.event!))}>
          {action.label}
        </button>
      )}
      <div className="tabbar-tabs">
        {PHONE_TABS.map((tab, i) => {
          const on = i === lit
          const photo = tab.id === 'you' && avatarUrl
          return (
            <Link
              key={tab.id}
              to={tab.path}
              className={`tab-item ${on ? 'active' : ''}`}
              aria-current={tab.routes.includes(route) ? 'page' : undefined}
              onPointerDown={() => setPressed(tab.id)}
              // The tab you're already on has no page to wait for.
              onPointerUp={() => tab.routes.includes(route) && setPressed(null)}
              onPointerCancel={() => setPressed(null)}
            >
              <span className="tab-icon">
                {photo ? (
                  <span className="tab-photo">
                    <AvatarFace account={account} />
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d={tab.icon} />
                  </svg>
                )}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
    </>
  )
}

const MENU = 'M4 7h16M4 12h16M4 17h16'
const CLOSE = 'M6 6l12 12M18 6 6 18'

/**
 * The Puzzles tab's buttons: Solve goes on along your path of rated puzzles (pages/puzzles/Hub.tsx), and the square
 * beside it opens the other modes above it, in the bar.
 */
function PuzzleActions({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  // Read afresh each time the bar draws, so coming back from a few puzzles shows where you are now.
  const progress = loadProgress()
  const mistakes = useMistakes()
  const waiting = mistakes?.filter((m) => !progress.mistakesSolved.includes(m.id)).length ?? 0
  const modes = [
    { to: '/puzzles/daily', icon: TAB_ICONS.daily, title: 'Daily puzzle' },
    { to: '/puzzles/sprint', icon: TAB_ICONS.sprint, title: 'Puzzle Sprint' },
    { to: '/puzzles/mistakes', icon: TAB_ICONS.mistakes, title: 'Fix your mistakes', badge: waiting },
  ]
  return (
    <>
      {open && (
        <div className="tabbar-modes">
          {modes.map((m, i) => (
            // How far it slides up from: Solve's row, below the last one.
            <Link key={m.to} to={m.to} className="tabbar-mode" style={{ '--from': modes.length - i } as CSSProperties}>
              <span className="tabbar-mode-icon" aria-hidden>
                <svg viewBox="0 0 24 24">{m.icon}</svg>
              </span>
              {m.title}
              {m.badge ? <span className="tabbar-mode-badge">{m.badge}</span> : null}
            </Link>
          ))}
        </div>
      )}
      <div className="tabbar-play-row">
        <button className="tabbar-more" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Close the modes' : 'More puzzle modes'}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={open ? CLOSE : MENU} />
          </svg>
        </button>
        <Link to="/puzzles/rated" className="btn accent-btn tabbar-play">
          Solve puzzles
        </Link>
      </div>
    </>
  )
}
