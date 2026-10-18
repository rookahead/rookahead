import type { ReactNode } from 'react'
import { NAV_ITEMS } from '../lib/nav'
import type { Route } from '../lib/router'
import { Link } from './Link'
import { RookLogo } from './RookLogo'
import { Wordmark } from './Wordmark'

interface Props {
  route: Route
  /** Icons only (the Analysis page, to keep the board big). */
  rail: boolean
  /** Collapse/expand button; left out where the sidebar is always full (Home). */
  onToggleRail?: () => void
  /** The user card. */
  footer: ReactNode
  /** The Today card, shown above the user card when the sidebar is full width. */
  today?: ReactNode
}

/** Desktop navigation: a floating panel, full window height, with the user card at the bottom. */
export function Sidebar({ route, rail, onToggleRail, footer, today }: Props) {
  return (
    <aside className={`sidebar ${rail ? 'rail' : ''}`} aria-label="Sidebar">
      <div className="sidebar-head">
        <Link to="/" className="sidebar-brand" aria-label="Rookahead home" aria-current={route === 'home' ? 'page' : undefined} title="Home">
          <RookLogo />
          <Wordmark className="sidebar-wordmark" />
        </Link>
        {onToggleRail && (
          <button className="icon-btn sidebar-toggle" onClick={onToggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand' : 'Collapse'}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={rail ? 'm10 7 5 5-5 5' : 'm14 7-5 5 5 5'} />
            </svg>
          </button>
        )}
      </div>
      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const icon = (
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={item.icon} />
            </svg>
          )
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
        {!rail && today}
        {footer}
        <div className="sidebar-links">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href="https://github.com/rookahead/rookahead">GitHub</a>
        </div>
      </div>
    </aside>
  )
}
