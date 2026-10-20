import { useAccount } from '../lib/account'
import { PHONE_TABS } from '../lib/nav'
import type { Route } from '../lib/router'
import { Link } from './Link'
import { AvatarFace } from './UserCard'

/** Phone navigation along the bottom of the screen. Your photo, when you've uploaded one, is the You tab's icon. */
export function TabBar({ route }: { route: Route }) {
  const { account, avatarUrl } = useAccount()
  return (
    <nav className="tabbar" aria-label="Main">
      {PHONE_TABS.map((tab) => {
        const on = tab.routes.includes(route)
        const photo = tab.id === 'you' && avatarUrl
        return (
          <Link key={tab.id} to={tab.path} className={`tab-item ${on ? 'active' : ''}`} aria-current={on ? 'page' : undefined}>
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
  )
}
