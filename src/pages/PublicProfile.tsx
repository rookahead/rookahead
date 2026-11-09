import { useEffect, useRef, useState } from 'react'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { Skel } from '../components/Skeleton'
import { useAccount } from '../lib/account'
import { acceptFriend, requestFriend, useFriends } from '../lib/friends'
import { fetchPublicProfile, reportProfile, type PublicProfile, type ReportReason } from '../lib/publicProfile'
import { NOTE_MAX } from '../lib/reports'

const JOINED = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

/**
 * Someone's public profile (rookahead.com/@name), seen by anyone: who they are, their ratings (online,
 * that is Lichess, and puzzles) and three counts. Never their games. Visitors can report it; its owner
 * sees it as others do, with the way back to their own profile.
 */
export function PublicProfilePage({ name }: { name: string }) {
  const { username } = useAccount()
  // undefined: asking; null: no public profile by that name; false: couldn't ask.
  const [profile, setProfile] = useState<PublicProfile | null | undefined | false>(undefined)
  const [reporting, setReporting] = useState(false)
  useEffect(() => {
    let live = true
    setProfile(undefined)
    void fetchPublicProfile(name).then((p) => live && setProfile(p === undefined ? false : p))
    return () => {
      live = false
    }
  }, [name])
  const own = Boolean(username && profile && username.toLowerCase() === profile.username.toLowerCase())

  let body
  if (profile === undefined) body = <PlayerSkeleton />
  else if (!profile)
    body = (
      <section className="home-card player-missing">
        <h1>{profile === null ? 'No public profile here' : 'Couldn’t load this profile'}</h1>
        <p>{profile === null ? `@${name} hasn’t made a profile public, or there’s no player by that name.` : 'Check your connection and try again.'}</p>
        <Link to="/" className="btn primary">
          Go to Rookahead
        </Link>
      </section>
    )
  else {
    const { stats } = profile
    body = (
      <>
        <section className="home-card profile-card" aria-label={profile.username}>
          <div className="profile-who">
            <span className="user-avatar profile-avatar" aria-hidden>
              <Face url={profile.avatarUrl} name={profile.username} />
            </span>
            <div className="profile-name">
              <h1>{profile.username}</h1>
              <p>Joined {JOINED.format(profile.joined)}</p>
              {own && (
                <p className="profile-linked">
                  This is how others see your profile.
                  <Link to="/profile" className="link-btn">
                    Your profile
                  </Link>
                </p>
              )}
            </div>
            {!own && (
              <div className="player-actions">
                {username && <FriendButton name={profile.username} />}
                <button className="link-btn player-report" onClick={() => setReporting(true)}>
                  Report
                </button>
              </div>
            )}
          </div>
        </section>
        <div className="profile-cols">
          <aside className="profile-side" aria-label="Ratings">
            <section className="home-card profile-ratings" aria-labelledby="ratings-head">
              <h2 id="ratings-head">Ratings</h2>
              <ul>
                {stats.online.map((r) => (
                  <li key={r.label}>
                    <span className="profile-rating">
                      <span className="profile-rating-text">
                        <strong>{r.label}</strong>
                        <small>
                          Online · {r.games} {r.games === 1 ? 'game' : 'games'}
                        </small>
                      </span>
                      <span className="profile-rating-value">
                        <b>{r.rating}</b>
                      </span>
                    </span>
                  </li>
                ))}
                <li>
                  <span className="profile-rating">
                    <span className="profile-rating-text">
                      <strong>Puzzles</strong>
                      <small>{stats.puzzles.solved} solved</small>
                    </span>
                    <span className="profile-rating-value">
                      <b>{stats.puzzles.rating}</b>
                    </span>
                  </span>
                </li>
              </ul>
            </section>
          </aside>
          <div className="profile-main">
            <section className="home-card player-counts" aria-label="Counts">
              <Count n={stats.games} label={stats.games === 1 ? 'Game' : 'Games'} />
              <Count n={stats.reviewed} label="Reviewed" />
              <Count n={stats.legendary} label="Legendary" />
            </section>
            {!own && (
              <section className="home-card accent-card hero-card" aria-labelledby="player-cta">
                <h2 id="player-cta">Review your own games</h2>
                <p>Rookahead reviews your chess games for free. No limit, no account needed.</p>
                <Link to="/" className="btn accent-btn">
                  Try Rookahead
                </Link>
              </section>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="profile player-page">{body}</main>
      {reporting && profile && <ReportProfileDialog username={profile.username} onClose={() => setReporting(false)} />}
    </div>
  )
}

/** Add them as a friend, or where that stands: asked, asking you, or friends already. */
function FriendButton({ name }: { name: string }) {
  const { friends } = useFriends()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const f = friends.find((x) => x.username.toLowerCase() === name.toLowerCase())
  if (f?.status === 'accepted') return <span className="player-friend">Friends</span>
  if (f && !f.incoming) return <span className="player-friend">Request sent</span>
  const act = async () => {
    setBusy(true)
    if (f) await acceptFriend(f.id)
    else {
      const r = await requestFriend(name)
      if (r !== 'sent' && r !== 'accepted' && r !== 'already') setNote('Couldn’t send it. Try again.')
    }
    setBusy(false)
  }
  return (
    <>
      <button className="btn primary small" disabled={busy} onClick={() => void act()}>
        {f ? 'Accept friend request' : 'Add friend'}
      </button>
      {note && <span className="form-error">{note}</span>}
    </>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className="player-count">
      <b>{n.toLocaleString('en-US')}</b>
      <small>{label}</small>
    </span>
  )
}

/** Their photo, or their initial when there's none (or it won't load). */
function Face({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  // crossOrigin: the page is cross-origin isolated, so images from other sites need CORS.
  if (url && !broken) return <img src={url} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  return <>{name.slice(0, 1).toUpperCase()}</>
}

function PlayerSkeleton() {
  return (
    <>
      <section className="home-card profile-card skel-group" aria-busy aria-label="Loading">
        <div className="profile-who">
          <span className="user-avatar profile-avatar" aria-hidden />
          <div className="profile-name">
            <Skel w="160px" h="26px" />
            <Skel w="120px" h="13px" />
          </div>
        </div>
      </section>
      <div className="profile-cols">
        <aside className="profile-side">
          <section className="home-card profile-ratings skel-group" aria-hidden>
            <Skel w="80px" h="18px" />
            <Skel w="100%" h="44px" />
            <Skel w="100%" h="44px" />
          </section>
        </aside>
        <div className="profile-main">
          <section className="home-card player-counts skel-group" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="player-count">
                <Skel w="48px" h="26px" />
                <Skel w="70px" h="12px" />
              </span>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}

const REASONS: [ReportReason, string][] = [
  ['name', 'Username'],
  ['photo', 'Photo'],
  ['other', 'Something else'],
]

/** "Report this profile": what's wrong in one tap, a note if they like, then a thank-you. */
function ReportProfileDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const close = () => dialog.current?.close()
  const send = async () => {
    if (!reason || sending) return
    setSending(true)
    setError(null)
    const problem = await reportProfile(username, reason, note)
    setSending(false)
    if (problem) setError(problem)
    else setSent(true)
  }

  return (
    <dialog
      ref={dialog}
      className="dialog confirm-dialog report-dialog"
      onClose={() => {
        // Unmount once the closing fade (0.16s in index.css) has played.
        setTimeout(onClose, 160)
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>{sent ? 'Thanks for the report' : `Report ${username}`}</h2>
        </header>
        {sent ? (
          <>
            <p className="confirm-body">Every report gets read, and we’ll act on it if the profile breaks the rules.</p>
            <footer className="confirm-actions single">
              <button className="btn big primary" onClick={close} autoFocus>
                Done
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="report-body">
              <div className="filter-chips" role="radiogroup" aria-label="What’s wrong">
                {REASONS.map(([id, label]) => (
                  <button key={id} className={`filter-chip all ${reason === id ? 'on' : ''}`} role="radio" aria-checked={reason === id} onClick={() => setReason(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                className="input report-note"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything to add? (optional)"
                aria-label="Note"
                rows={3}
              />
              {error && <p className="form-error">{error}</p>}
            </div>
            <footer className="confirm-actions">
              <button className="btn big ghost" onClick={close}>
                Cancel
              </button>
              <button className="btn big primary" onClick={send} disabled={!reason || sending}>
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  )
}
