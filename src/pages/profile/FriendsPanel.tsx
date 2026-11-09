import { useState } from 'react'
import { Link } from '../../components/Link'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../../lib/account'
import { acceptFriend, activeText, deleteInboxGame, markSeen, removeFriend, requestFriend, useFriends, type Friend, type InboxGame, type RequestResult } from '../../lib/friends'
import { exportPgn } from '../../lib/pgn'
import { profilePath } from '../../lib/publicProfile'
import { writeSession } from '../../lib/session'
import { decodeShare, fromSharedGame } from '../../lib/share'
import { mainline } from '../../lib/tree'

const RESULT: Record<RequestResult, string> = {
  sent: 'Request sent. You’re friends once they accept.',
  accepted: 'They had asked you already: you’re friends now.',
  already: 'You’re already friends, or a request is waiting.',
  self: 'That’s you.',
  'not-found': 'No Rookahead player by that username.',
  busy: 'You’ve sent a lot of requests this hour. Try again later.',
  error: 'Couldn’t send the request. Check your connection and try again.',
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

function Face({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="user-avatar friend-avatar" aria-hidden>
      {url && !broken ? <img src={url} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Opens a game a friend sent in Game review, at the move they picked, with its review when it had one. */
async function openSent(game: InboxGame, onOpenAnalysis: () => void): Promise<string | null> {
  const shared = await decodeShare(game.token)
  if ('error' in shared) return shared.error === 'newer-version' ? 'This game was sent from a newer Rookahead. Reload to open it.' : 'This game couldn’t be read.'
  const { tree, headers, orientation, evals } = fromSharedGame(shared)
  writeSession({ pgn: exportPgn(mainline(tree), headers, { clocks: false }), orientation, currentPly: game.ply ?? 0, evals, classes: shared.review?.classes })
  if (!game.seen) void markSeen(game.id)
  onOpenAnalysis()
  return null
}

/**
 * Your friends: add one by username, answer requests, open games they sent you. Each friend shows when they last
 * opened Rookahead; their name opens their public profile, if they have one.
 */
export function FriendsPanel({ onOpenAnalysis }: { onOpenAnalysis: () => void }) {
  const { status } = useAccount()
  const { friends, inbox, loaded } = useFriends()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RequestResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (status !== 'signed-in')
    return (
      <section className="home-card accent-card hero-card" aria-labelledby="friends-hero">
        <h2 id="friends-hero">Add your friends</h2>
        <p>Friends see when you’re around and can send you games. Sign in to add yours: it’s free.</p>
        {ACCOUNTS_ENABLED && (
          <div className="friends-guest-actions">
            <button className="btn accent-btn" onClick={() => openAccountPage('signup')}>
              Sign up
            </button>
            <button className="btn ghost" onClick={() => openAccountPage('login')}>
              Log in
            </button>
          </div>
        )}
      </section>
    )

  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const r = await requestFriend(name)
    setBusy(false)
    setResult(r)
    if (r === 'sent' || r === 'accepted') setName('')
  }

  const requests = friends.filter((f) => f.status === 'pending' && f.incoming)
  const waiting = friends.filter((f) => f.status === 'pending' && !f.incoming)
  const mine = friends.filter((f) => f.status === 'accepted').sort((a, b) => (b.activeAt ?? 0) - (a.activeAt ?? 0))

  return (
    <>
      <section className="home-card friends-card" aria-labelledby="friends-add">
        <h2 id="friends-add">Add a friend</h2>
        <form
          className="friends-add"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setResult(null)
            }}
            placeholder="Their Rookahead username"
            aria-label="Their Rookahead username"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Sending…' : 'Add friend'}
          </button>
        </form>
        {result && <p className={result === 'sent' || result === 'accepted' ? 'friends-ok' : 'form-error'}>{RESULT[result]}</p>}
      </section>

      {requests.length > 0 && (
        <section className="home-card friends-card" aria-labelledby="friends-requests">
          <h2 id="friends-requests">
            Friend requests <span className="friends-count">{requests.length}</span>
          </h2>
          <ul className="friends-list">
            {requests.map((f) => (
              <li key={f.id} className="friend-row">
                <Face url={f.avatarUrl} name={f.username} />
                <span className="friend-text">
                  <strong>{f.username}</strong>
                  <small>Asked {SHORT_DATE.format(f.since)}</small>
                </span>
                <span className="friend-actions">
                  <button className="link-btn strong" onClick={() => void acceptFriend(f.id)}>
                    Accept
                  </button>
                  <button className="link-btn" onClick={() => void removeFriend(f.id)}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inbox.length > 0 && (
        <section className="home-card friends-card" aria-labelledby="friends-inbox">
          <h2 id="friends-inbox">Sent to you</h2>
          {problem && <p className="form-error">{problem}</p>}
          <ul className="friends-list">
            {inbox.map((g) => (
              <li key={g.id} className={`friend-row ${g.seen ? '' : 'new'}`}>
                <Face url={g.fromAvatar} name={g.from} />
                <span className="friend-text">
                  <strong>
                    {g.from}
                    {!g.seen && <span className="friend-new">New</span>}
                  </strong>
                  <small>
                    {g.title || 'A game'} · {SHORT_DATE.format(g.at)}
                  </small>
                  {g.note && <q className="friend-note">{g.note}</q>}
                </span>
                <span className="friend-actions">
                  <button className="link-btn strong" onClick={() => void openSent(g, onOpenAnalysis).then(setProblem)}>
                    Open
                  </button>
                  <button className="link-btn" onClick={() => void deleteInboxGame(g.id)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-card friends-card" aria-labelledby="friends-mine">
        <h2 id="friends-mine">
          Friends {mine.length > 0 && <span className="friends-count">{mine.length}</span>}
        </h2>
        {!loaded ? (
          <p className="muted">Loading your friends…</p>
        ) : mine.length === 0 ? (
          <p className="muted">No friends yet. Add one by their Rookahead username above.</p>
        ) : (
          <ul className="friends-list">
            {mine.map((f) => (
              <FriendRow key={f.id} friend={f} />
            ))}
          </ul>
        )}
        {waiting.length > 0 && (
          <>
            <h3 className="friends-sub">Waiting for an answer</h3>
            <ul className="friends-list">
              {waiting.map((f) => (
                <li key={f.id} className="friend-row">
                  <Face url={f.avatarUrl} name={f.username} />
                  <span className="friend-text">
                    <strong>{f.username}</strong>
                    <small>Asked {SHORT_DATE.format(f.since)}</small>
                  </span>
                  <span className="friend-actions">
                    <button className="link-btn" onClick={() => void removeFriend(f.id)}>
                      Cancel
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}

function FriendRow({ friend: f }: { friend: Friend }) {
  const [confirm, setConfirm] = useState(false)
  const active = activeText(f.activeAt)
  return (
    <li className="friend-row">
      <Face url={f.avatarUrl} name={f.username} />
      <span className="friend-text">
        <Link to={profilePath(f.username)} className="friend-name">
          {f.username}
        </Link>
        <small>
          <span className={active === 'Active now' ? 'friend-online' : ''}>{active}</span>
          {f.lichess && ` · Lichess ${f.lichess}`}
        </small>
      </span>
      <span className="friend-actions">
        {confirm ? (
          <>
            <button className="link-btn danger" onClick={() => void removeFriend(f.id)}>
              Remove
            </button>
            <button className="link-btn" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="link-btn" onClick={() => setConfirm(true)}>
            Remove
          </button>
        )}
      </span>
    </li>
  )
}
