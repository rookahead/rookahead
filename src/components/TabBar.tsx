import { useEffect, useState, type CSSProperties } from 'react'
import { useAccount } from '../lib/account'
import { PHONE_TABS } from '../lib/nav'
import type { Route } from '../lib/router'
import { Link } from './Link'
import { AvatarFace } from './UserCard'

/** Phone navigation along the bottom of the screen. Your photo, when you've uploaded one, is the You tab's icon. */
export function TabBar({ route }: { route: Route }) {
  const { account, avatarUrl } = useAccount()
  // The pill glides to a tab at the touch, not when its page has opened, so a page that takes a moment still
  // answers at once.
  const [pressed, setPressed] = useState<string | null>(null)
  useEffect(() => setPressed(null), [route])
  const lit = PHONE_TABS.findIndex((tab) => (pressed ? pressed === tab.id : tab.routes.includes(route)))
  return (
    <>
    {/* Home's big button, above the bar rather than in the page, so it doesn't ride along when pages slide. */}
    {route === 'home' && (
      <div className="phone-play">
        <Link to="/play" className="btn accent-btn">
          Play the computer
        </Link>
      </div>
    )}
    <nav className="tabbar" aria-label="Main">
      {lit >= 0 && <span className="tab-pill" style={{ '--tab': lit } as CSSProperties} aria-hidden />}
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
    </nav>
    </>
  )
}
