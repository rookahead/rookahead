import { useCallback, useState } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount, type Account } from '../lib/account'
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings'
import { AccountMenu } from './AccountMenu'

interface Props {
  rail: boolean
  settingsOpen: boolean
  onSettings: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)
const SUN = 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
const MOON = 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'
const SPEAKER = 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'
const MUTED = 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5'

/** Your uploaded photo, else your username's initial; `?` for a guest. */
export function AvatarFace({ account }: { account: Account | null }) {
  const { avatarUrl, username } = useAccount()
  const [broken, setBroken] = useState<string | null>(null)
  if (!account && !username) return <>?</>
  if (avatarUrl && broken !== avatarUrl) {
    // crossOrigin: the page is cross-origin isolated, so images from other sites need CORS.
    return <img src={avatarUrl} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBroken(avatarUrl)} />
  }
  return <>{(username ?? account?.name ?? '?').slice(0, 1).toUpperCase()}</>
}

/** Who you are and the way into settings, at the foot of the sidebar. Guests get the way to sign up. */
export function UserCard({ rail, settingsOpen, onSettings, settings: prefs, onChange }: Props) {
  const { status, account, username, needsUsername, sync } = useAccount()
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  // The account menu is open against this button.
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])
  const guest = status !== 'signed-in'
  // Keyed: the card's layout changes as a saved sign-in comes back (signing in, then you), and the gear moves
  // among its siblings; without a key it would be a new button each time, and a click landing then is lost.
  const settings = (
    <button key="settings" className={`icon-btn user-card-gear ${settingsOpen ? 'active' : ''}`} onClick={onSettings} aria-label="Settings" title="Settings">
      <Gear />
    </button>
  )
  const canSignUp = ACCOUNTS_ENABLED && status === 'guest'
  // Expanded, a guest gets real buttons: Sign up (the one coloured thing) and Log in, then quick toggles.
  if (canSignUp && !rail) {
    const dark = prefs.appearance === 'system' ? !systemLight : prefs.appearance !== 'light'
    const muted = prefs.soundVolume === 0
    return (
      <div className="user-card guest-card">
        <button className="btn accent-btn guest-signup" onClick={() => openAccountPage('signup')}>
          Sign up
        </button>
        <button className="btn ghost guest-login" onClick={() => openAccountPage('login')}>
          Log in
        </button>
        <div className="guest-card-tools">
          <button
            className="icon-btn"
            onClick={() => onChange({ appearance: dark ? 'light' : 'dark' })}
            aria-label={dark ? 'Light theme' : 'Dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
          >
            {icon(dark ? SUN : MOON)}
          </button>
          <button
            className="icon-btn"
            onClick={() => onChange({ soundVolume: muted ? DEFAULT_SETTINGS.soundVolume : 0 })}
            aria-label={muted ? 'Sounds on' : 'Sounds off'}
            title={muted ? 'Sounds on' : 'Sounds off'}
          >
            {icon(muted ? MUTED : SPEAKER)}
          </button>
          <button className={`icon-btn ${settingsOpen ? 'active' : ''}`} onClick={onSettings} aria-label="Settings" title="Settings">
            <Gear />
          </button>
        </div>
      </div>
    )
  }
  // Until the username arrives (just signed in, on a new device) nothing shows, rather than the Google name.
  const waiting = !username && !needsUsername && status !== 'guest'
  const face = canSignUp ? '?' : waiting ? '' : <AvatarFace account={account} />
  // In the rail only the avatar shows, so it's the way into settings (sign-up is in there too).
  const avatar = rail ? (
    <button className={`user-avatar ${guest ? 'guest' : ''}`} onClick={onSettings} aria-label="Settings" title="Settings">
      {face}
    </button>
  ) : (
    <span className={`user-avatar ${guest ? 'guest' : ''}`} aria-hidden>
      {face}
    </span>
  )
  // Signed in: you (avatar and name) are the button for the account menu, with Log out one click away.
  if (status === 'signed-in' && account && !needsUsername && username) {
    return (
      <div className="user-card">
        <button
          className={`user-card-who ${menuAt ? 'active' : ''}`}
          onClick={(e) => {
            const at = e.currentTarget
            setMenuAt((open) => (open ? null : at))
          }}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAt)}
          title="Account"
        >
          <span className="user-avatar" aria-hidden>
            <AvatarFace account={account} />
          </span>
          <span className="user-card-text">
            <strong>{username}</strong>
            {/* Syncing is normally invisible; only changes stuck on this device are worth a line. */}
            {sync === 'offline' && <span className="user-card-sync offline">Offline · will sync later</span>}
          </span>
        </button>
        {settings}
        {menuAt && <AccountMenu anchor={menuAt} placement="up" onClose={closeMenu} />}
      </div>
    )
  }
  // A guest's buttons, folded on the rail: the card keeps their height (index.css).
  return (
    <div className={`user-card ${canSignUp ? 'folded-guest' : ''}`}>
      {avatar}
      {status === 'signed-in' && account ? (
        needsUsername ? (
          <button className="user-card-text user-card-signup" onClick={() => openAccountPage()}>
            <strong>{account.name}</strong>
            <span>Choose a username</span>
          </button>
        ) : (
          <span className="user-card-text">
            <strong>{username ?? 'Signing in…'}</strong>
            {/* Syncing is normally invisible; only changes stuck on this device are worth a line. */}
            {sync === 'offline' && <span className="user-card-sync offline">Offline · will sync later</span>}
          </span>
        )
      ) : status === 'loading' && username ? (
        <span className="user-card-text">
          <strong>{username}</strong>
        </span>
      ) : (
        <span className="user-card-text">
          <strong>{status === 'loading' ? 'Signing in…' : 'Guest'}</strong>
        </span>
      )}
      {settings}
    </div>
  )
}
