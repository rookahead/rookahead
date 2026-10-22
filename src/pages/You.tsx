import { useState, type ReactNode } from 'react'
import { BOARD_THEMES } from '../components/Board'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { PalettePicker } from '../components/PalettePicker'
import { AvatarFace } from '../components/UserCard'
import { ACCOUNTS_ENABLED, hasUnsynced, logOut, openAccountPage, useAccount } from '../lib/account'
import { useInstall } from '../lib/install'
import { DISCORD_URL } from '../lib/links'
import { DEFAULT_SETTINGS, type Appearance, type Settings } from '../lib/settings'

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)
const CHEVRON = icon('M9 6l6 6-6 6')

/** Phones: you and your settings in one tab. Quick switches first, then the full settings, the app, and the small print. */
export function YouPage({ settings, updateSettings }: Props) {
  const { status, account, username, needsUsername, sync } = useAccount()
  const install = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  const [confirmLogOut, setConfirmLogOut] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const signedIn = status === 'signed-in' && account
  const muted = settings.soundVolume === 0
  const board = BOARD_THEMES[settings.boardTheme]

  const leave = async () => {
    setLeaving(true)
    await logOut()
    setLeaving(false)
  }

  const rows: { to: string; label: string; hint?: string; d: string; show: boolean }[] = [
    { to: '/settings/profile', label: 'Profile', hint: signedIn ? 'Username, photo' : undefined, d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0', show: ACCOUNTS_ENABLED && Boolean(signedIn) },
    { to: '/settings/linked', label: 'Linked accounts', hint: 'Chess.com, Lichess', d: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1', show: true },
    { to: '/settings/appearance', label: 'Appearance', d: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18', show: true },
    { to: '/settings/account', label: 'Account', hint: 'Email, password', d: 'M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v2', show: ACCOUNTS_ENABLED && Boolean(signedIn) },
  ]

  let who: ReactNode = null
  if (signedIn) {
    who = (
      <section className="you-who" aria-label="You">
        <span className="user-avatar you-avatar" aria-hidden>
          <AvatarFace account={account} />
        </span>
        <span className="you-name">
          <strong>{needsUsername ? account.name : (username ?? 'Signing in…')}</strong>
          <span>{sync === 'offline' ? 'Offline · will sync later' : 'Synced across your devices'}</span>
        </span>
        <Link to={needsUsername ? '/signup' : '/settings/profile'} className="btn ghost small">
          {needsUsername ? 'Choose a username' : 'Edit'}
        </Link>
      </section>
    )
  } else if (ACCOUNTS_ENABLED) {
    who = (
      <section className="home-card accent-card you-guest" aria-labelledby="you-guest">
        <h2 id="you-guest">Save your progress</h2>
        <p>You’re a guest, so your games, reviews and puzzles live in this browser only. A free account keeps them on every device.</p>
        <div className="you-guest-actions">
          <button className="btn accent-btn" disabled={status === 'loading'} onClick={() => openAccountPage('signup')}>
            Sign up, it’s free
          </button>
          <button className="btn ghost" disabled={status === 'loading'} onClick={() => openAccountPage('login')}>
            Log in
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="you-page">
        {who}

        <section className="home-card you-list" aria-label="Quick settings">
          <div className="you-row">
            <span className="you-row-label">Theme</span>
            <div className="segmented you-theme" role="radiogroup" aria-label="Theme">
              {(
                [
                  ['dark', 'Dark'],
                  ['black', 'Black'],
                  ['light', 'Light'],
                  ['system', 'Auto'],
                ] as [Appearance, string][]
              ).map(([v, text]) => (
                <button key={v} role="radio" aria-checked={settings.appearance === v} className={settings.appearance === v ? 'active' : ''} onClick={() => updateSettings({ appearance: v })}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div className="you-row">
            <span className="you-row-label">Colour</span>
            <PalettePicker compact value={settings.palette} onChange={(palette) => updateSettings({ palette })} />
          </div>
          <label className="you-row">
            <span className="you-row-label">Move sounds</span>
            <span className="switch">
              <input type="checkbox" role="switch" checked={!muted} onChange={() => updateSettings({ soundVolume: muted ? DEFAULT_SETTINGS.soundVolume : 0 })} />
              <span className="switch-track" />
            </span>
          </label>
          <Link to="/settings/board" className="you-row">
            <span className="you-row-label">Board and sounds</span>
            <span className="you-row-hint">
              <span className="you-swatch" aria-hidden style={{ background: `conic-gradient(${board.light} 0 25%, ${board.dark} 0 50%, ${board.light} 0 75%, ${board.dark} 0)` }} />
              {board.label}
            </span>
            {CHEVRON}
          </Link>
        </section>

        <nav className="home-card you-list" aria-label="Settings">
          {rows
            .filter((r) => r.show)
            .map((r) => (
              <Link key={r.to} to={r.to} className="you-row">
                {icon(r.d)}
                <span className="you-row-label">{r.label}</span>
                {r.hint && <span className="you-row-hint">{r.hint}</span>}
                {CHEVRON}
              </Link>
            ))}
        </nav>

        {install.how && (
          <section className="home-card accent-card you-install" aria-labelledby="you-install">
            <span className="you-install-icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M6 3h3v2h2V3h2v2h2V3h3v5l-2 2v6l2 2v3H6v-3l2-2v-6L6 8z" />
              </svg>
            </span>
            <span className="you-install-text">
              <strong id="you-install">Get the app</strong>
              <span>{iosHelp ? 'Tap Share in Safari, then “Add to Home Screen”.' : 'Opens full screen from your home screen.'}</span>
            </span>
            {install.how === 'prompt' ? (
              <button className="btn accent-btn small" onClick={() => void install.install()}>
                Install
              </button>
            ) : (
              !iosHelp && (
                <button className="btn accent-btn small" onClick={() => setIosHelp(true)}>
                  How
                </button>
              )
            )}
          </section>
        )}

        {signedIn && (
          <button className="btn ghost you-logout" disabled={leaving} onClick={() => (hasUnsynced() ? setConfirmLogOut(true) : void leave())}>
            {leaving ? 'Logging out…' : 'Log out'}
          </button>
        )}

        <nav className="you-links" aria-label="Site">
          <a href="/blog">Blog</a>
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href={DISCORD_URL}>Discord</a>
          <a href="https://github.com/rookahead/rookahead">GitHub</a>
        </nav>
      </main>

      {confirmLogOut && (
        <ConfirmDialog title="Log out now?" confirm="Log out anyway" danger onConfirm={() => void leave()} onClose={() => setConfirmLogOut(false)}>
          Some changes haven’t reached your account yet (you seem to be offline). Logging out now loses them.
        </ConfirmDialog>
      )}
    </div>
  )
}
