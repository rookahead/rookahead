import { NAV_ITEMS } from '../lib/nav'
import type { Route } from '../lib/router'
import { Link } from './Link'

/** Phone navigation along the bottom of the screen. */
export function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const icon = (
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={item.icon} />
          </svg>
        )
        return item.path ? (
          <Link key={item.id} to={item.path} className={`tab-item ${route === item.id ? 'active' : ''}`} aria-current={route === item.id ? 'page' : undefined}>
            {icon}
            {item.label}
          </Link>
        ) : (
          <span key={item.id} className="tab-item soon" aria-disabled="true" title={`${item.label}: coming soon`}>
            {icon}
            {item.label}
          </span>
        )
      })}
    </nav>
  )
}
