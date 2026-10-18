import { useState } from 'react'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount, type Account, type AccountState } from '../lib/account'

interface Props {
  rail: boolean
  settingsOpen: boolean
  onSettings: () => void
}

const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** Your picture (Google's), else your initial; `?` for a guest. */
export function AvatarFace({ account }: { account: Account | null }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (!account) return <>?</>
  if (account.avatar && broken !== account.avatar) {
    // crossOrigin: the page is cross-origin isolated, so images from other sites need CORS.
    return <img src={account.avatar} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBroken(account.avatar!)} />
  }
  return <>{account.name.slice(0, 1).toUpperCase()}</>
}

const SYNC_LINE: Record<AccountState['sync'], string> = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline · will sync later' }

/** Who you are and the way into settings, at the foot of the sidebar. Guests get the way to sign up. */
export function UserCard({ rail, settingsOpen, onSettings }: Props) {
  const { status, account, username, needsUsername, sync } = useAccount()
  const guest = status !== 'signed-in'
  const settings = (
    <button className={`icon-btn user-card-gear ${settingsOpen ? 'active' : ''}`} onClick={onSettings} aria-label="Settings" title="Settings">
      <Gear />
    </button>
  )
  const canSignUp = ACCOUNTS_ENABLED && status === 'guest'
  const avatar = canSignUp ? (
    <button className="user-avatar guest" onClick={() => openAccountPage()} aria-label="Sign up" title="Sign up">
      ?
    </button>
  ) : (
    <span className={`user-avatar ${guest ? 'guest' : ''}`} aria-hidden>
      {status === 'loading' ? '' : <AvatarFace account={account} />}
    </span>
  )
  if (rail) {
    return (
      <div className="user-card rail">
        {avatar}
        {settings}
      </div>
    )
  }
  return (
    <div className="user-card">
      {avatar}
      {status === 'signed-in' && account ? (
        needsUsername ? (
          <button className="user-card-text user-card-signup" onClick={() => openAccountPage()}>
            <strong>{account.name}</strong>
            <span>Choose a username</span>
          </button>
        ) : (
          <span className="user-card-text">
            <strong>{username ?? account.name}</strong>
            <span className={`user-card-sync ${sync}`}>{SYNC_LINE[sync]}</span>
          </span>
        )
      ) : canSignUp ? (
        <button className="user-card-text user-card-signup" onClick={() => openAccountPage()}>
          <strong>Guest</strong>
          <span>Sign up · it's free</span>
        </button>
      ) : (
        <span className="user-card-text">
          <strong>{status === 'loading' ? 'Signing in…' : 'Guest'}</strong>
        </span>
      )}
      {settings}
    </div>
  )
}
