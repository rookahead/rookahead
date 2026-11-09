import { useEffect, useState } from 'react'
import { explore, total, type ExplorerAnswer, type ExplorerSource } from '../lib/explorer'
import { connectLichess, useLichess } from '../lib/lichessAuth'
import { previewAt, type Preview } from './MovePreview'

const OPEN_KEY = 'rookahead.explorer'
/** A position you step past quickly isn't asked for: only the one you stop on. */
const SETTLE_MS = 220

interface Saved {
  on: boolean
  source: ExplorerSource
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null')
    return { on: raw?.on !== false, source: raw?.source === 'masters' ? 'masters' : 'lichess' }
  } catch {
    return { on: true, source: 'lichess' }
  }
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))
const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100)

interface Props {
  fen: string
  onPlay: (uci: string) => void
  onPreview?: (preview: Preview | null) => void
}

/**
 * Lichess's opening explorer beside the engine: the moves played from this position, how often, and how those
 * games ended, from masters or from rated games on Lichess. Needs your Lichess connection; a move plays on the board.
 */
export function Explorer({ fen, onPlay, onPreview }: Props) {
  const { link, busy, error } = useLichess()
  const [saved, setSaved] = useState(load)
  const save = (patch: Partial<Saved>) =>
    setSaved((was) => {
      const next = { ...was, ...patch }
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        // Not remembered; fine.
      }
      return next
    })
  const [answer, setAnswer] = useState<{ key: string; value: ExplorerAnswer } | null>(null)
  const key = `${saved.source} ${fen}`
  const live = Boolean(link) && saved.on

  useEffect(() => {
    if (!live) return
    const abort = new AbortController()
    const timer = setTimeout(() => {
      explore(saved.source, fen, abort.signal).then(
        (value) => setAnswer({ key, value }),
        () => {},
      )
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [live, saved.source, fen, key])

  const current = answer?.key === key ? answer.value : null
  const result = current && 'ok' in current ? current.ok : null
  const all = result ? total(result) : 0

  let body
  if (!link)
    body = (
      <div className="explorer-connect">
        <p>See what masters and Lichess players played from here, and how it went for them.</p>
        <button className="btn small primary" disabled={busy} onClick={() => void connectLichess()}>
          {busy ? 'Connecting…' : 'Connect Lichess'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </div>
    )
  else if (!saved.on) body = <div className="engine-empty">Explorer is off</div>
  else if (!current)
    body = (
      <div className="explorer-moves">
        {[0, 1, 2].map((i) => (
          <div key={i} className="engine-line skeleton" />
        ))}
      </div>
    )
  else if ('error' in current)
    body = (
      <div className="engine-empty">
        {current.error === 'busy' ? 'Lichess is busy. Try again in a minute.' : current.error === 'offline' ? 'Couldn’t reach Lichess.' : 'Connect Lichess again to use the explorer.'}
      </div>
    )
  else if (!result || !result.moves.length) body = <div className="engine-empty">No {saved.source === 'masters' ? 'master' : 'Lichess'} games reached this position</div>
  else
    body = (
      <div className="explorer-moves" onMouseLeave={() => onPreview?.(null)}>
        {result.moves.map((m) => {
          const games = total(m)
          const w = pct(m.white, games)
          const b = pct(m.black, games)
          return (
            <button
              key={m.uci}
              className="explorer-move"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPreview?.(null)
                onPlay(m.uci)
              }}
              onMouseEnter={(e) => onPreview?.(previewAt(fen, [m.uci], 1, e.currentTarget.closest('.explorer-panel')!.getBoundingClientRect()))}
              title={`${games.toLocaleString('en-US')} games${m.rating ? ` · average rating ${m.rating}` : ''}`}
            >
              <span className="explorer-san">{m.san}</span>
              <span className="explorer-count">
                {compact(games)} <small>{pct(games, all)}%</small>
              </span>
              <span className="explorer-bar" aria-label={`White won ${w}%, drawn ${100 - w - b}%, Black won ${b}%`}>
                <span className="white" style={{ flexGrow: Math.max(m.white, 0.0001) }}>
                  {w >= 12 && `${w}%`}
                </span>
                <span className="draw" style={{ flexGrow: m.draws }}>
                  {100 - w - b >= 12 && `${100 - w - b}%`}
                </span>
                <span className="black" style={{ flexGrow: m.black }}>
                  {b >= 12 && `${b}%`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    )

  return (
    <section className="engine-panel explorer-panel">
      <header className="engine-header">
        {link && (
          <label className="switch" title="Explorer on or off">
            <input type="checkbox" checked={saved.on} onChange={() => save({ on: !saved.on })} />
            <span className="switch-track" />
          </label>
        )}
        <div className="engine-title">
          <span className="engine-name">Opening explorer</span>
          <span className="engine-meta">
            {result?.opening ? `${result.opening.eco} · ${result.opening.name}` : link ? (saved.source === 'masters' ? 'Masters’ games' : 'Lichess, rated 1600+') : 'From Lichess'}
          </span>
        </div>
        {link && (
          <div className="segmented explorer-source" role="radiogroup" aria-label="Whose games">
            {(['masters', 'lichess'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={saved.source === s} className={saved.source === s ? 'active' : ''} onClick={() => save({ source: s })}>
                {s === 'masters' ? 'Masters' : 'Lichess'}
              </button>
            ))}
          </div>
        )}
      </header>
      {body}
    </section>
  )
}
