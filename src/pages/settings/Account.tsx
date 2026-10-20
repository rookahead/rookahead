import { useState } from 'react'
import { deleteAccount, hasUnsynced, logOut, PASSWORD_MIN, setPassword, useAccount } from '../../lib/account'
import { PasswordField } from '../auth/fields'
import { Row, Section } from './shared'

/** A new password and Save. */
function PasswordEditor({ label, onDone }: { label: string; onDone: (saved: boolean) => void }) {
  const [password, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="settings-inline-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (password.length < PASSWORD_MIN) return
        setBusy(true)
        setError(null)
        const err = await setPassword(password)
        setBusy(false)
        if (err) setError(err)
        else onDone(true)
      }}
    >
      <PasswordField value={password} onChange={setValue} fresh={{ min: PASSWORD_MIN }} label={label} />
      {error && <p className="form-error">{error}</p>}
      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={() => onDone(false)}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || password.length < PASSWORD_MIN}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  )
}

/** Password, logging out, and deleting the account (kept apart, at the foot). */
export function AccountSection() {
  const { account } = useAccount()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState<'logout' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!account) return null

  const run = async (action: () => Promise<string | null | void>) => {
    setBusy(true)
    setError(null)
    const err = await action()
    setBusy(false)
    setConfirming(null)
    if (err) setError(err)
  }

  const passwordHint = saved
    ? 'Saved. Use it next time you sign in with your email.'
    : account.hasPassword
      ? 'Sign in with your email and password.'
      : 'You sign in with Google. Add a password to sign in with your email too.'

  return (
    <Section title="Account" lead={<>Signed in as {account.email}.</>}>
      {editing ? (
        <Row wide>
          <PasswordEditor
            label={account.hasPassword ? 'New password' : 'Add a password'}
            onDone={(ok) => {
              setEditing(false)
              setSaved(ok)
            }}
          />
        </Row>
      ) : (
        <Row label="Password" hint={passwordHint}>
          <button className="btn ghost small" onClick={() => setEditing(true)}>
            {account.hasPassword ? 'Change' : 'Add'}
          </button>
        </Row>
      )}

      <Row label="Log out" hint="Logs out on this device. Your games, reviews and puzzles stay in your account.">
        <button className="btn ghost small" disabled={busy} onClick={() => (hasUnsynced() ? setConfirming('logout') : void run(logOut))}>
          Log out
        </button>
      </Row>
      {confirming === 'logout' && (
        <div className="account-confirm">
          <p>Some changes haven’t reached your account yet (you seem to be offline). Logging out now loses them.</p>
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

      <div className="settings-danger">
        <Row label="Delete account" hint="Deletes your account and everything saved in it: games, reviews, puzzle progress and photo. This can’t be undone." tone="danger">
          {confirming !== 'delete' && (
            <button className="btn small ghost danger" onClick={() => setConfirming('delete')}>
              Delete
            </button>
          )}
        </Row>
        {confirming === 'delete' && (
          <div className="account-confirm">
            <p>Delete your account and everything saved in it? This can’t be undone.</p>
            <div className="account-confirm-actions">
              <button className="btn small ghost" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button className="btn small danger-btn" disabled={busy} onClick={() => void run(deleteAccount)}>
                {busy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Section>
  )
}
