import type { ReactNode } from 'react'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ACCOUNTS_ENABLED, useAccount } from '../lib/account'
import { settingsSection, usePathname, type SettingsSection } from '../lib/router'
import type { Settings } from '../lib/settings'
import { AccountSection } from './settings/Account'
import { AppearanceSection } from './settings/Appearance'
import { BoardSection } from './settings/BoardSection'
import { LinkedSection } from './settings/Linked'
import { ProfileSection } from './settings/Profile'

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0') },
  { id: 'linked', label: 'Linked accounts', icon: icon('M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1') },
  { id: 'board', label: 'Board', icon: icon('M4 4h16v16H4zM4 12h16M12 4v16M4 8h4M8 4v8M12 16h4M16 12v8') },
  { id: 'appearance', label: 'Appearance', icon: icon('M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18') },
  { id: 'account', label: 'Account', icon: icon('M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v2') },
]

const CHEVRON = icon('M9 6l6 6-6 6')

/** Settings: the sections listed at the left, the open one at the right. On phones the list is its own screen. */
export function SettingsPage({ settings, updateSettings }: Props) {
  const phone = useMediaQuery('(max-width: 1000px)')
  const pathname = usePathname()
  const { status } = useAccount()
  // Guests have no account to manage (Profile is where they sign up); without accounts there's neither.
  const sections = SECTIONS.filter((s) => (s.id === 'profile' ? ACCOUNTS_ENABLED : s.id === 'account' ? ACCOUNTS_ENABLED && status === 'signed-in' : true))
  const asked = settingsSection(pathname)
  const open = sections.find((s) => s.id === asked)?.id ?? (phone ? null : sections[0].id)

  let body: ReactNode = null
  if (open === 'profile') body = <ProfileSection />
  else if (open === 'linked') body = <LinkedSection settings={settings} onChange={updateSettings} />
  else if (open === 'board') body = <BoardSection settings={settings} onChange={updateSettings} />
  else if (open === 'appearance') body = <AppearanceSection settings={settings} onChange={updateSettings} />
  else if (open === 'account') body = <AccountSection />

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="settings-page">
        {(!phone || !open) && <h1 className="settings-title">Settings</h1>}
        <div className="settings-layout">
          {(!phone || !open) && (
            <nav className="settings-nav" aria-label="Settings">
              {sections.map((s) => (
                <Link key={s.id} to={`/settings/${s.id}`} className={`settings-nav-item ${open === s.id ? 'active' : ''}`} aria-current={open === s.id ? 'page' : undefined}>
                  {s.icon}
                  <span>{s.label}</span>
                  {phone && <span className="settings-nav-chevron">{CHEVRON}</span>}
                </Link>
              ))}
            </nav>
          )}
          {open && (
            <section className="settings-body" key={open}>
              {phone && (
                <Link to="/you" className="settings-back">
                  {icon('M15 6l-6 6 6 6')}
                  You
                </Link>
              )}
              {body}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
