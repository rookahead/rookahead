import { useRef, useState } from 'react'
import { AvatarFace } from '../../components/UserCard'
import { changeUsername, openAccountPage, removeAvatar, uploadAvatar, useAccount } from '../../lib/account'
import { UsernameField } from '../auth/fields'
import { Row, Section } from './shared'

const PERKS: [string, string][] = [
  ['M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM9 20h6M12 16v4', 'The same games, reviews and puzzle progress on your phone and computer'],
  ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z', 'Nothing lost if this browser’s data is cleared'],
  ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0', 'Your own username and photo'],
]

/** Guests: what an account gives you, and the way to one. */
function GuestProfile() {
  const { status } = useAccount()
  return (
    <Section title="Profile" lead="You’re using Rookahead as a guest, so everything is kept in this browser only.">
      <div className="settings-guest">
        <h3>Make it yours</h3>
        <ul className="settings-perks">
          {PERKS.map(([d, text]) => (
            <li key={text}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={d} />
              </svg>
              {text}
            </li>
          ))}
        </ul>
        <div className="settings-guest-actions">
          <button className="btn signup-btn" disabled={status === 'loading'} onClick={() => openAccountPage('signup')}>
            Sign up, it’s free
          </button>
          <button className="btn ghost" disabled={status === 'loading'} onClick={() => openAccountPage('login')}>
            Log in
          </button>
        </div>
      </div>
    </Section>
  )
}

/** Renaming: the username box (checks it's free as you type), then Save. */
function UsernameEditor({ current, onDone }: { current: string; onDone: () => void }) {
  const [name, setName] = useState(current)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="settings-inline-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        setError(null)
        const err = await changeUsername(name)
        setBusy(false)
        if (err) setError(err)
        else onDone()
      }}
    >
      <UsernameField value={name} onChange={setName} onStatus={setOk} current={current} />
      {error && <p className="form-error">{error}</p>}
      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary" disabled={!ok || busy}>
          {busy ? 'Saving…' : 'Save username'}
        </button>
      </div>
    </form>
  )
}

/** Your photo, username and email. */
export function ProfileSection() {
  const { status, account, username, avatarUrl } = useAccount()
  const picker = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  if (status === 'guest') return <GuestProfile />
  if (status === 'loading' || !account) {
    return (
      <Section title="Profile">
        <p className="settings-loading">Signing in…</p>
      </Section>
    )
  }

  const photo = async (action: () => Promise<string | null>) => {
    setPhotoBusy(true)
    setError(null)
    const err = await action()
    setPhotoBusy(false)
    if (err) setError(err)
  }

  return (
    <Section title="Profile" lead="How you appear on Rookahead.">
      <Row label="Photo" hint="A square photo works best. It’s shrunk to a small image before it’s saved.">
        <div className="settings-photo">
          <button className="user-avatar account-photo" onClick={() => picker.current?.click()} disabled={photoBusy} aria-label={avatarUrl ? 'Change photo' : 'Add a photo'}>
            <AvatarFace account={account} />
            <span className="account-photo-edit" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
            </span>
          </button>
          <button className="btn ghost small" disabled={photoBusy} onClick={() => picker.current?.click()}>
            {photoBusy ? 'Saving…' : avatarUrl ? 'Change' : 'Upload'}
          </button>
          {avatarUrl && !photoBusy && (
            <button className="btn ghost small" onClick={() => void photo(removeAvatar)}>
              Remove
            </button>
          )}
        </div>
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
      </Row>
      {error && <p className="form-error">{error}</p>}

      {renaming && username ? (
        <Row wide>
          <UsernameEditor current={username} onDone={() => setRenaming(false)} />
        </Row>
      ) : (
        <Row label="Username" hint={<strong className="settings-value">{username ?? '…'}</strong>}>
          <button className="btn ghost small" disabled={!username} onClick={() => setRenaming(true)}>
            Change
          </button>
        </Row>
      )}

      <Row label="Email" hint={<span className="settings-value">{account.email}</span>} />
    </Section>
  )
}
