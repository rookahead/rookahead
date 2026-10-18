import { validateFen } from 'chess.js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as chesscom from '../lib/chesscom'
import type { Color } from '../lib/evaluation'
import * as lichess from '../lib/lichess'

export type LoadRequest = { kind: 'pgn'; pgn: string; orientation?: Color } | { kind: 'fen'; fen: string }

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (req: LoadRequest) => string | null // returns an error message, or null on success
  chesscomUser: string
  onChesscomUser: (name: string) => void
  lichessUser: string
  onLichessUser: (name: string) => void
}

type Tab = 'chesscom' | 'lichess' | 'pgn' | 'fen'

/** What the games list needs from a site's game, Chess.com's or Lichess's. */
interface ListedGame {
  url: string
  pgn: string
  timeControl: string
  endTime: number
  white: { username: string; rating?: number }
  black: { username: string; rating?: number }
  opening?: string
}

interface Source<G extends ListedGame> {
  name: string
  fetchGames: (username: string) => Promise<G[]>
  outcomeFor: (game: G, username: string) => 'win' | 'loss' | 'draw'
  empty: string
}

const CHESSCOM: Source<chesscom.ChesscomGame> = {
  name: 'Chess.com',
  fetchGames: (u) => chesscom.fetchRecentGames(u),
  outcomeFor: chesscom.outcomeFor,
  empty: 'No standard games in the last few months.',
}

const LICHESS: Source<lichess.LichessGame> = {
  name: 'Lichess',
  fetchGames: (u) => lichess.fetchRecentGames(u),
  outcomeFor: lichess.outcomeFor,
  empty: 'No standard games yet.',
}

const isWhite = (g: ListedGame, user: string) => g.white.username.toLowerCase() === user.toLowerCase()

function relativeDate(epochSeconds: number) {
  const days = Math.floor((Date.now() / 1000 - epochSeconds) / 86400)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function GamesTab<G extends ListedGame>({ source, user, onUser, onPick }: { source: Source<G>; user: string; onUser: (u: string) => void; onPick: (g: G, user: string) => void }) {
  const [input, setInput] = useState(user)
  const [games, setGames] = useState<G[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedFor, setFetchedFor] = useState('')

  const load = async (name: string) => {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const list = await source.fetchGames(name)
      setGames(list)
      setFetchedFor(name.trim())
      onUser(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not reach ${source.name}.`)
      setGames(null)
    } finally {
      setLoading(false)
    }
  }

  // Fetch straight away when we remember the username.
  const autoLoaded = useRef(false)
  useEffect(() => {
    if (!autoLoaded.current && user) {
      autoLoaded.current = true
      void load(user)
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void load(input)
  }

  return (
    <div className="tab-body">
      <form className="inline-form" onSubmit={submit}>
        <input
          className="input"
          placeholder={`${source.name} username`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          spellCheck={false}
        />
        <button className="btn primary" disabled={loading || !input.trim()}>
          {loading ? 'Loading…' : 'Get games'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {games && games.length === 0 && <p className="muted">{source.empty}</p>}
      {games && games.length > 0 && (
        <ul className="game-list">
          {games.map((g) => {
            const outcome = source.outcomeFor(g, fetchedFor)
            const meWhite = isWhite(g, fetchedFor)
            const opp = meWhite ? g.black : g.white
            return (
              <li key={g.url}>
                <button className="game-row" onClick={() => onPick(g, fetchedFor)}>
                  <span className={`outcome ${outcome}`}>{outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D'}</span>
                  <span className="game-players">
                    <span className="game-opponent">
                      <span className={`dot ${meWhite ? 'black' : 'white'}`} />
                      {opp.username} {opp.rating != null && <span className="muted">({opp.rating})</span>}
                    </span>
                    <span className="game-sub muted">{g.opening ?? 'Unknown opening'}</span>
                  </span>
                  <span className="game-meta">
                    <span>{g.timeControl === '-' ? 'Unlimited' : chesscom.formatTimeControl(g.timeControl)}</span>
                    <span className="muted">{relativeDate(g.endTime)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function LoadGameDialog({ open, onClose, onLoad, chesscomUser, onChesscomUser, lichessUser, onLichessUser }: Props) {
  // Open on the site the player uses, when we only know one of their usernames.
  const [tab, setTab] = useState<Tab>(lichessUser && !chesscomUser ? 'lichess' : 'chesscom')
  const [pgn, setPgn] = useState('')
  const [fen, setFen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const finish = (req: LoadRequest) => {
    const err = onLoad(req)
    setError(err)
    if (!err) onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="dialog"
      onClose={() => {
        onClose()
        // The browser hands focus back to the "Load game" button; drop it so no stray focus ring lingers.
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose() // backdrop click
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>Load a game</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="tabs" role="tablist">
          {(
            [
              ['chesscom', 'Chess.com'],
              ['lichess', 'Lichess'],
              ['pgn', 'PGN'],
              ['fen', 'FEN'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setTab(id)
                setError(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {open && tab === 'chesscom' && (
          <GamesTab
            key="chesscom"
            source={CHESSCOM}
            user={chesscomUser}
            onUser={onChesscomUser}
            onPick={(g, user) => finish({ kind: 'pgn', pgn: g.pgn, orientation: isWhite(g, user) ? 'white' : 'black' })}
          />
        )}

        {open && tab === 'lichess' && (
          <GamesTab
            key="lichess"
            source={LICHESS}
            user={lichessUser}
            onUser={onLichessUser}
            onPick={(g, user) => finish({ kind: 'pgn', pgn: g.pgn, orientation: isWhite(g, user) ? 'white' : 'black' })}
          />
        )}

        {tab === 'pgn' && (
          <form
            className="tab-body"
            onSubmit={(e) => {
              e.preventDefault()
              finish({ kind: 'pgn', pgn })
            }}
          >
            <textarea
              className="input textarea"
              placeholder={'[Event "Live Chess"]\n…\n1. e4 e5 2. Nf3 Nc6 …'}
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="btn primary" disabled={!pgn.trim()}>
                Load PGN
              </button>
            </div>
          </form>
        )}

        {tab === 'fen' && (
          <form
            className="tab-body"
            onSubmit={(e) => {
              e.preventDefault()
              const check = validateFen(fen.trim())
              if (!check.ok) return setError(check.error ?? 'Invalid FEN')
              finish({ kind: 'fen', fen: fen.trim() })
            }}
          >
            <input
              className="input mono"
              placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
              value={fen}
              onChange={(e) => setFen(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="btn primary" disabled={!fen.trim()}>
                Set position
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
