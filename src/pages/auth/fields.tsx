import { useEffect, useState, type ReactNode } from 'react'
import { usernameFree } from '../../lib/account'
import { usernameProblem } from '../../lib/username'

/** Google's "G", as its sign-in guidelines ask for on the button. */
export const GoogleG = () => (
  <svg viewBox="0 0 48 48" aria-hidden className="google-g">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

type Availability = 'checking' | 'free' | 'taken' | 'unknown' | null

/** A username box that checks the rules as you type and asks the server whether it's free. */
export function UsernameField({ value, onChange, onStatus }: { value: string; onChange: (v: string) => void; onStatus: (ok: boolean) => void }) {
  const [available, setAvailable] = useState<Availability>(null)
  const problem = value ? usernameProblem(value) : null
  useEffect(() => {
    if (!value || problem) return
    let stale = false
    const t = setTimeout(() => {
      setAvailable('checking')
      usernameFree(value).then((free) => !stale && setAvailable(free === null ? 'unknown' : free ? 'free' : 'taken'))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
      setAvailable(null)
    }
  }, [value, problem])
  // 'unknown' (couldn't ask) lets you go on: the database has the final say.
  const ok = Boolean(value) && !problem && (available === 'free' || available === 'unknown')
  useEffect(() => onStatus(ok), [ok, onStatus])

  let hint: ReactNode = 'Letters, digits, _ and -, 3 to 20 long. Other players will see it, and it can’t be changed later.'
  let tone = ''
  if (value && problem) [hint, tone] = [problem, 'bad']
  else if (available === 'taken') [hint, tone] = [`“${value}” is taken. Try another.`, 'bad']
  else if (available === 'free') [hint, tone] = [`“${value}” is free.`, 'good']
  else if (available === 'checking') hint = 'Checking…'

  return (
    <label className="auth-field">
      <span className="auth-label">Username</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        aria-invalid={tone === 'bad'}
      />
      <span className={`auth-hint ${tone}`}>{hint}</span>
    </label>
  )
}

/** A password box with a show/hide eye. `fresh`: a new password (hint, and password managers suggest one). */
export function PasswordField({
  value,
  onChange,
  fresh,
  label = 'Password',
  aside,
}: {
  value: string
  onChange: (v: string) => void
  fresh?: { min: number }
  label?: string
  aside?: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const short = fresh && value.length > 0 && value.length < fresh.min
  return (
    <label className="auth-field">
      <span className="auth-label">
        {label}
        {aside}
      </span>
      <span className="auth-password">
        <input
          className="input"
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={fresh ? 'new-password' : 'current-password'}
          minLength={fresh?.min}
          required
          aria-invalid={short || undefined}
        />
        <button type="button" className="icon-btn auth-eye" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide' : 'Show'}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </span>
      {fresh && <span className={`auth-hint ${short ? 'bad' : ''}`}>At least {fresh.min} characters.</span>}
    </label>
  )
}
