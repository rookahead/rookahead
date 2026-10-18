import { validateFen } from 'chess.js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fetchRecentGames, formatTimeControl, outcomeFor, type ChesscomGame } from '../lib/chesscom'
import type { Color } from '../lib/evaluation'

export type LoadRequest = { kind: 'pgn'; pgn: string; orientation?: Color } | { kind: 'fen'; fen: string }

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (req: LoadRequest) => string | null // returns an error message, or null on success
  chesscomUser: string
  onChesscomUser: (name: string) => void
}

type Tab = 'chesscom' | 'pgn' | 'fen'

function relativeDate(epochSeconds: number) {
  const days = Math.floor((Date.now() / 1000 - epochSeconds) / 86400)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ChesscomTab({ user, onUser, onPick }: { user: string; onUser: (u: string) => void; onPick: (g: ChesscomGame, user: string) => void }) {
  const [input, setInput] = useState(user)
  const [games, setGames] = useState<ChesscomGame[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedFor, setFetchedFor] = useState('')

  const load = async (name: string) => {
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const list = await fetchRecentGames(name)
      setGames(list)
      setFetchedFor(name.trim())
      onUser(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Chess.com.')
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
          placeholder="Chess.com username"
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
      {games && games.length === 0 && <p className="muted">No standard games in the last few months.</p>}
      {games && games.length > 0 && (
        <ul className="game-list">
          {games.map((g) => {
            const outcome = outcomeFor(g, fetchedFor)
            const meWhite = g.white.username.toLowerCase() === fetchedFor.toLowerCase()
            const opp = meWhite ? g.black : g.white
            return (
              <li key={g.url}>
                <button className="game-row" onClick={() => onPick(g, fetchedFor)}>
                  <span className={`outcome ${outcome}`}>{outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D'}</span>
                  <span className="game-players">
                    <span className="game-opponent">
                      <span className={`dot ${meWhite ? 'black' : 'white'}`} />
                      {opp.username} <span className="muted">({opp.rating})</span>
                    </span>
                    <span className="game-sub muted">{g.opening ?? 'Unknown opening'}</span>
                  </span>
                  <span className="game-meta">
                    <span>{formatTimeControl(g.timeControl)}</span>
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

export function LoadGameDialog({ open, onClose, onLoad, chesscomUser, onChesscomUser }: Props) {
  const [tab, setTab] = useState<Tab>('chesscom')
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
          <ChesscomTab
            user={chesscomUser}
            onUser={onChesscomUser}
            onPick={(g, user) => {
              const meWhite = g.white.username.toLowerCase() === user.toLowerCase()
              finish({ kind: 'pgn', pgn: g.pgn, orientation: meWhite ? 'white' : 'black' })
            }}
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
