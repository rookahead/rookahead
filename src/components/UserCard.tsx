import { useCallback, useState, type ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount, type Account } from '../lib/account'
import { unseenCount, useFriends } from '../lib/friends'
import { useRoute } from '../lib/router'
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings'
import { AccountMenu } from './AccountMenu'
import { Face } from './DefaultFace'

interface Props {
  rail: boolean
  settingsOpen: boolean
  onSettings: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** More buttons for the row along the card's foot (the sidebar's: Community, Blog, Collapse). */
  tools?: ReactNode
}

/** Settings, everywhere (the app's, the board's, the engine's): a nut, a soft hexagon with a round hole, solid. */
export const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    {/* Solid even where the button draws its icons as lines. */}
    <path
      fillRule="evenodd"
      style={{ fill: 'currentColor', stroke: 'none' }}
      d="M10.09 3.5Q12 2.4 13.91 3.5L18.41 6.1Q20.31 7.2 20.31 9.4L20.31 14.6Q20.31 16.8 18.41 17.9L13.91 20.5Q12 21.6 10.09 20.5L5.59 17.9Q3.69 16.8 3.69 14.6L3.69 9.4Q3.69 7.2 5.59 6.1ZM15.3 12A3.3 3.3 0 1 0 8.7 12A3.3 3.3 0 1 0 15.3 12Z"
    />
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

/** Your photo or chosen piece, else your name's piece on grey (DefaultFace); `?` for a guest. */
export function AvatarFace({ account }: { account: Account | null }) {
  const { avatarUrl, username } = useAccount()
  if (!account && !username) return <>?</>
  return <Face url={avatarUrl} name={username ?? account?.name ?? ''} />
}

/**
 * Who you are and the way into settings, at the foot of the sidebar, with no box of its own: a row of plain icons
 * (theme, sounds, settings, and the sidebar's), then you on the menu's lines. Guests get the way to sign up.
 */
export function UserCard({ rail, settingsOpen, onSettings, settings: prefs, onChange, tools }: Props) {
  const { status, account, username, needsUsername, sync } = useAccount()
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  // The account menu is open against this button.
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])
  const guest = status !== 'signed-in'
  const onProfile = useRoute() === 'games'
  // A friend request or a game from a friend you haven't seen yet.
  const unseen = unseenCount(useFriends())
  const canSignUp = ACCOUNTS_ENABLED && status === 'guest'
  const dark = prefs.appearance === 'system' ? !systemLight : prefs.appearance !== 'light'
  const muted = prefs.soundVolume === 0
  // Over you, for everyone: the theme, sounds, settings, and the sidebar's own buttons. On the rail
  // only the last of those (unfolding it) shows (index.css).
  const toolsRow = (
    <div className="user-card-tools">
      <button className="icon-btn" onClick={() => onChange({ appearance: dark ? 'light' : 'dark' })} aria-label={dark ? 'Light theme' : 'Dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
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
      {tools}
    </div>
  )
  // Expanded, a guest gets the row, then real buttons side by side: Sign up (the one coloured thing) and Log in.
  if (canSignUp && !rail) {
    return (
      <div className="user-card guest-card">
        {toolsRow}
        <div className="guest-card-buttons">
          <button className="btn accent-btn guest-signup" onClick={() => openAccountPage('signup')}>
            Sign up
          </button>
          <button className="btn ghost guest-login" onClick={() => openAccountPage('login')}>
            Log in
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
  // Signed in: you (avatar and name) are the button for the account menu, with Log out one click away. While a
  // reload restores the session, the same row shows from the username kept on this device (its menu opens once
  // it's back), so the card doesn't show another layout for a moment first.
  const restoring = status === 'loading' && !!username
  if ((status === 'signed-in' && account && !needsUsername && username) || restoring) {
    return (
      <div className="user-card stacked">
        {toolsRow}
        <button
          className={`user-card-who ${menuAt || onProfile ? 'active' : ''}`}
          onClick={(e) => {
            if (restoring) return
            const at = e.currentTarget
            setMenuAt((open) => (open ? null : at))
          }}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAt)}
          title="Account"
        >
          <span className="user-avatar" aria-hidden>
            <AvatarFace account={account} />
            {unseen > 0 && <span className="unseen-dot" />}
          </span>
          <span className="user-card-text">
            <strong>{username}</strong>
            {/* Syncing is normally invisible; only changes stuck on this device are worth a line. */}
            {sync === 'offline' && <span className="user-card-sync offline">Offline · will sync later</span>}
          </span>
        </button>
        {menuAt && <AccountMenu anchor={menuAt} placement="up" onClose={closeMenu} />}
      </div>
    )
  }
  // Anyone else (and a guest on the rail): the avatar and a line, then the row.
  return (
    <div className="user-card stacked">
      {toolsRow}
      <div className="user-card-top">
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
      ) : (
        <span className="user-card-text">
          <strong>{status === 'loading' ? 'Signing in…' : 'Guest'}</strong>
        </span>
      )}
      </div>
    </div>
  )
}
