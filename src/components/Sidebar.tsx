import type { ReactNode } from 'react'
import { NAV_ITEMS, type NavItem } from '../lib/nav'
import type { Route } from '../lib/router'
import { Link } from './Link'
import { RookLogo } from './RookLogo'
import { Wordmark } from './Wordmark'

interface Props {
  route: Route
  /** Icons only; the full sidebar is the default. */
  rail: boolean
  onToggleRail: () => void
  /** The user card. */
  footer: ReactNode
}

/** A section's icon: its strokes, plus any solid shapes. */
export function NavItemIcon({ item }: { item: NavItem }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={item.icon} />
      {item.fill && <path className="icon-fill" d={item.fill} />}
    </svg>
  )
}

/**
 * Desktop navigation: a floating panel, full window height, with the user card at the bottom.
 * Collapsing slides it to a rail of icons: the icons, logo and avatar keep their places while
 * the words fade and the width (and with it the page) animates.
 */
export function Sidebar({ route, rail, onToggleRail, footer }: Props) {
  return (
    <aside className={`sidebar ${rail ? 'rail' : ''}`} aria-label="Sidebar">
      <div className="sidebar-head">
        <Link to="/" className="sidebar-brand" aria-label="Rookahead home" aria-current={route === 'home' ? 'page' : undefined} title="Home">
          <RookLogo />
          <Wordmark className="sidebar-wordmark" />
        </Link>
      </div>
      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const icon = <NavItemIcon item={item} />
          return item.path ? (
            <Link
              key={item.id}
              to={item.path}
              className={`sidebar-item ${route === item.id ? 'active' : ''} ${item.featured ? 'featured' : ''}`}
              aria-current={route === item.id ? 'page' : undefined}
              title={rail ? item.label : undefined}
            >
              {icon}
              <span className="sidebar-label">{item.label}</span>
            </Link>
          ) : (
            <span key={item.id} className="sidebar-item soon" aria-disabled="true" title={`${item.label}: coming soon`}>
              {icon}
              <span className="sidebar-label">{item.label}</span>
              <span className="soon-tag">Soon</span>
            </span>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        {footer}
        <div className="sidebar-bottom">
          <button className="icon-btn sidebar-toggle" onClick={onToggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand' : 'Collapse'}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="m11 7-5 5 5 5M18 7l-5 5 5 5" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
