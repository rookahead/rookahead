import { useRef, useState } from 'react'
import { deleteAccount, hasUnsynced, logOut, openAccountPage, removeAvatar, uploadAvatar, useAccount } from '../lib/account'
import { AvatarFace } from './UserCard'

/** The top of Settings: sign up, or who you're signed in as with Log out and Delete account. */
export function AccountSettings({ onClose }: { onClose: () => void }) {
  const { status, account, username, avatarUrl } = useAccount()
  const picker = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
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

  const photo = async (action: () => Promise<string | null>) => {
    setPhotoBusy(true)
    setError(null)
    const err = await action()
    setPhotoBusy(false)
    if (err) setError(err)
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
        <button className="user-avatar account-photo" onClick={() => picker.current?.click()} disabled={photoBusy} aria-label={avatarUrl ? 'Change photo' : 'Add a photo'} title={avatarUrl ? 'Change photo' : 'Add a photo'}>
          <AvatarFace account={account} />
          <span className="account-photo-edit" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void photo(() => uploadAvatar(file))
          }}
        />
        <span className="account-text">
          <strong>{username ?? account.name}</strong>
          <span>{account.email}</span>
          <span className="account-photo-links">
            <button className="link-btn" disabled={photoBusy} onClick={() => picker.current?.click()}>
              {photoBusy ? 'Saving…' : avatarUrl ? 'Change photo' : 'Add a photo'}
            </button>
            {avatarUrl && !photoBusy && (
              <button className="link-btn" onClick={() => void photo(removeAvatar)}>
                Remove
              </button>
            )}
          </span>
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
