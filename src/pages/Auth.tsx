import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '../components/Link'
import { Tabs } from '../components/Tabs'
import {
  chooseUsername,
  clearAccountError,
  confirmEmail,
  logOut,
  PASSWORD_MIN,
  preloadAccounts,
  registerWithEmail,
  resendConfirmation,
  resetPasswordWithCode,
  sendPasswordReset,
  setPassword,
  signInWithGoogle,
  signInWithPassword,
  useAccount,
} from '../lib/account'
import { afterSignIn, navigate, usePathname } from '../lib/router'
import { Brand } from './auth/Brand'
import { GoogleG, PasswordField, UsernameField } from './auth/fields'

const RESEND_AFTER = 60

/** A starting username from the account's name or email: what's allowed of it, if enough is. */
function suggestUsername(name: string | undefined): string {
  const base = (name ?? '').replace(/[^A-Za-z0-9_-]/g, '').replace(/^[_-]+/, '').slice(0, 20)
  return base.length >= 3 ? base : ''
}

/** Where to go once signed in: `?next=`, if it's a path on this site. */
const nextPath = () => afterSignIn(location.pathname + location.search)

/** Steps after the first form: the emailed code to confirm an address, and resetting a password. */
type Step = 'form' | 'confirm' | 'forgot' | 'reset'

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="input auth-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      aria-label="Code from the email"
      maxLength={10}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      autoFocus
    />
  )
}

/** Sign in, Register, confirming an email, passwords and usernames: everything accounts need, on one page. */
export function AuthPage() {
  const pathname = usePathname()
  const register = pathname.startsWith('/signup')
  const resetLink = pathname.startsWith('/reset-password')
  const { status, username, needsUsername, account, error: accountError } = useAccount()
  const [step, setStep] = useState<Step>('form')
  // Null until typed in: the username step starts from a suggestion.
  const [name, setName] = useState<string | null>(null)
  const [nameOk, setNameOk] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPasswordValue] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [passwordSaved, setPasswordSaved] = useState(false)

  useEffect(() => preloadAccounts(), [])
  const pickedName = name ?? suggestUsername(account?.name)
  // Signed in, waiting a moment for the username: the form stays, busy, so nothing flashes before we move on.
  const pending = busy || (status === 'signed-in' && !needsUsername && !(resetLink && !passwordSaved))
  // Signed in with a username: on to where you were going (after a new password, if that's why you came).
  const done = status === 'signed-in' && Boolean(username) && (!resetLink || passwordSaved)
  useEffect(() => {
    if (done && !busy) navigate(nextPath(), { replace: true })
  }, [done, busy])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const go = (next: Step) => {
    setStep(next)
    setCode('')
    // A new password starts empty, not with whatever was typed to sign in.
    if (next === 'reset') setPasswordValue('')
    setError(null)
    setNotice(null)
    clearAccountError()
  }

  /** Runs a request with the form busy; its error (if any) is shown. Returns whether it worked. */
  const run = async (request: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    clearAccountError()
    const err = await request()
    setBusy(false)
    if (err) setError(err)
    return !err
  }

  const google = () => {
    // On success the page is leaving for Google; only an error comes back here.
    void run(signInWithGoogle)
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    if (register) {
      if (password.length < PASSWORD_MIN) return
      let result: Awaited<ReturnType<typeof registerWithEmail>> | undefined
      await run(async () => {
        result = await registerWithEmail(email.trim(), password)
        return 'error' in result ? result.error : null
      })
      if (result && 'confirm' in result) {
        go('confirm')
        setWait(RESEND_AFTER)
      } else if (result && 'exists' in result) {
        setError('This email already has an account. Sign in instead, or reset its password.')
      }
    } else {
      let unconfirmed = false
      await run(async () => {
        const result = await signInWithPassword(email.trim(), password)
        unconfirmed = Boolean(result?.unconfirmed)
        return result?.error ?? null
      })
      if (unconfirmed) {
        go('confirm')
        setError('Confirm your email first: enter the code we sent you, or ask for a new one.')
      }
    }
  }

  const resend = async () => {
    const sent = await run(() => (step === 'confirm' ? resendConfirmation(email.trim()) : sendPasswordReset(email.trim())))
    if (sent) {
      setWait(RESEND_AFTER)
      setNotice('Sent. Check your inbox (and spam).')
    }
  }

  const resendLinks = (
    <p className="auth-links">
      <button className="link-btn" onClick={() => void resend()} disabled={busy || wait > 0}>
        {wait > 0 ? `Resend in ${wait}s` : 'Resend email'}
      </button>
      <span aria-hidden>·</span>
      <button className="link-btn" onClick={() => go('form')}>
        {step === 'confirm' ? 'Use a different email' : 'Back to sign in'}
      </button>
    </p>
  )

  // Back from Google, on the way to the page you were headed for: nothing to show here.
  if (pathname.startsWith('/auth/google')) return null

  let body: ReactNode
  if (status === 'loading' && !busy) {
    body = <p className="auth-wait">Signing you in…</p>
  } else if (status === 'signed-in' && resetLink && !passwordSaved) {
    // Arrived from the reset email's link: signed in for this one purpose.
    body = (
      <>
        <h2>Choose a new password</h2>
        <p className="auth-lead">
          For <strong>{account?.email}</strong>.
        </p>
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (password.length >= PASSWORD_MIN && (await run(() => setPassword(password)))) setPasswordSaved(true)
          }}
        >
          <PasswordField value={password} onChange={setPasswordValue} fresh={{ min: PASSWORD_MIN }} label="New password" />
          <button className="btn big primary" disabled={pending || password.length < PASSWORD_MIN}>
            {pending ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </>
    )
  } else if (status === 'signed-in' && needsUsername) {
    body = (
      <>
        <h2>Choose your username</h2>
        <p className="auth-lead">
          You’re signed in as <strong>{account?.email}</strong>. One last thing: the name other players will see.
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (nameOk) void run(() => chooseUsername(pickedName))
          }}
        >
          <UsernameField value={pickedName} onChange={setName} onStatus={setNameOk} />
          <button className="btn big primary" disabled={pending || !nameOk}>
            {pending ? 'Saving…' : 'Continue'}
          </button>
        </form>
        <p className="auth-links">
          <button className="link-btn" onClick={() => void logOut()}>
            Not you? Log out
          </button>
        </p>
      </>
    )
  } else if (step === 'confirm') {
    body = (
      <>
        <h2>Confirm your email</h2>
        <p className="auth-lead">
          We sent a code to <strong>{email.trim()}</strong>. Enter it here, or open the link in the email on this device.
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length >= 6) void run(() => confirmEmail(email.trim(), code))
          }}
        >
          <CodeInput value={code} onChange={setCode} />
          <button className="btn big primary" disabled={pending || code.length < 6}>
            {pending ? 'Checking…' : 'Confirm'}
          </button>
        </form>
        {resendLinks}
      </>
    )
  } else if (step === 'forgot') {
    body = (
      <>
        <h2>Reset your password</h2>
        <p className="auth-lead">Enter your account’s email. We’ll send a code to choose a new password.</p>
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => sendPasswordReset(email.trim()))) {
              go('reset')
              setWait(RESEND_AFTER)
            }
          }}
        >
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <button className="btn big primary" disabled={pending || !email.trim()}>
            {pending ? 'Sending…' : 'Send code'}
          </button>
        </form>
        <p className="auth-links">
          <button className="link-btn" onClick={() => go('form')}>
            Back to sign in
          </button>
        </p>
      </>
    )
  } else if (step === 'reset') {
    body = (
      <>
        <h2>Choose a new password</h2>
        <p className="auth-lead">
          If <strong>{email.trim()}</strong> has an account, we sent it a code. Enter it with your new password, or open the link in the email on
          this device.
        </p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length >= 6 && password.length >= PASSWORD_MIN) void run(() => resetPasswordWithCode(email.trim(), code, password))
          }}
        >
          <CodeInput value={code} onChange={setCode} />
          <PasswordField value={password} onChange={setPasswordValue} fresh={{ min: PASSWORD_MIN }} label="New password" />
          <button className="btn big primary" disabled={pending || code.length < 6 || password.length < PASSWORD_MIN}>
            {pending ? 'Saving…' : 'Save password and sign in'}
          </button>
        </form>
        {resendLinks}
      </>
    )
  } else {
    body = (
      <>
        <Tabs
          label="Account"
          value={register ? 'signup' : 'login'}
          items={[
            { id: 'login', label: 'Sign in', to: `/login${location.search}` },
            { id: 'signup', label: 'Register', to: `/signup${location.search}` },
          ]}
          onSelect={() => go('form')}
        />
        <form className="auth-form" onSubmit={submitForm}>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <PasswordField
            value={password}
            onChange={setPasswordValue}
            fresh={register ? { min: PASSWORD_MIN } : undefined}
            aside={
              !register && (
                <button type="button" className="link-btn auth-forgot" onClick={() => go('forgot')}>
                  Forgot password?
                </button>
              )
            }
          />
          <button className="btn big primary" disabled={pending || !email.trim() || (register ? password.length < PASSWORD_MIN : !password)}>
            {pending ? (register ? 'Creating…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="auth-or" role="separator">
          <span>or</span>
        </div>
        <button className="btn big ghost auth-google" onClick={google} disabled={pending}>
          <GoogleG />
          Continue with Google
        </button>
        {register && (
          <p className="auth-fine">
            You’ll pick a username next. We use your email only for your account: confirming it, and resetting your password.{' '}
            <a href="/privacy">Privacy</a>
          </p>
        )}
      </>
    )
  }

  const shown = error ?? accountError
  return (
    <div className="auth-page">
      <Brand />
      <main className="auth-panel">
        <div className="auth-box">
          {body}
          {shown && (
            <p className="form-error auth-error" role="alert">
              {shown}
            </p>
          )}
          {notice && !shown && <p className="auth-notice">{notice}</p>}
          {status === 'guest' && (
            <Link to={nextPath()} className="auth-guest">
              Not now, continue as a guest
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
