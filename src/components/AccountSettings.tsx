import { useState } from 'react'
import { deleteAccount, hasUnsynced, logOut, openAccountPage, useAccount } from '../lib/account'
import { AvatarFace } from './UserCard'

/** The top of Settings: sign up, or who you're signed in as with Log out and Delete account. */
export function AccountSettings({ onClose }: { onClose: () => void }) {
  const { status, account, username } = useAccount()
  const [confirming, setConfirming] = useState<'logout' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'signed-in' || !account) {
    return (
      <div className="account-row">
        <span className="user-avatar guest" aria-hidden>
          ?
        </span>
        <span className="account-text">
          <strong>Guest</strong>
          <span>Sign up to keep your progress on every device.</span>
        </span>
        <button
          className="btn small primary"
          disabled={status === 'loading'}
          onClick={() => {
            onClose()
            openAccountPage()
          }}
        >
          Sign up
        </button>
      </div>
    )
  }

  const run = async (action: () => Promise<string | null | void>) => {
    setBusy(true)
    setError(null)
    const err = await action()
    setBusy(false)
    setConfirming(null)
    if (err) setError(err)
  }

  return (
    <div className="account">
      <div className="account-row">
        <span className="user-avatar" aria-hidden>
          <AvatarFace account={account} />
        </span>
        <span className="account-text">
          <strong>{username ?? account.name}</strong>
          <span>{account.email}</span>
        </span>
        <button className="btn small ghost" disabled={busy} onClick={() => (hasUnsynced() ? setConfirming('logout') : void run(logOut))}>
          Log out
        </button>
      </div>
      {confirming === 'logout' && (
        <div className="account-confirm">
          <p>Some changes haven't reached your account yet (you seem to be offline). Logging out now loses them.</p>
          <div className="account-confirm-actions">
            <button className="btn small ghost" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button className="btn small ghost danger" disabled={busy} onClick={() => void run(logOut)}>
              Log out anyway
            </button>
          </div>
        </div>
      )}
      {confirming === 'delete' ? (
        <div className="account-confirm">
          <p>Delete your account and everything saved in it? This can't be undone.</p>
          <div className="account-confirm-actions">
            <button className="btn small ghost" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button className="btn small ghost danger" disabled={busy} onClick={() => void run(deleteAccount)}>
              {busy ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </div>
      ) : (
        <button className="link-btn account-delete" onClick={() => setConfirming('delete')}>
          Delete account
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
