import { memo } from 'react'
import type { AnalysisResult, EngineLine, EngineStatus } from '../engine/Engine'
import type { TerminalState } from '../hooks/useAnalysis'
import { favoured, formatScore } from '../lib/evaluation'
import { pvToSan } from '../lib/tree'
import { previewAt, type Preview } from './MovePreview'
import { Gear } from './UserCard'

interface Props {
  fen: string
  status: EngineStatus | null
  enabled: boolean
  onToggle: () => void
  result: AnalysisResult | null
  searching: boolean
  maxLines: number
  terminal: TerminalState | null
  reviewing: boolean
  /** Play the first `count` moves of a line on the board. */
  onPlayLine: (pv: string[], count: number) => void
  /** Opens the analysis settings (the gear in the header). */
  onOpenSettings: () => void
  /** Pointing at a move: a preview of the position after it (null when the pointer leaves). */
  onPreview?: (preview: Preview | null) => void
}

function formatNps(nps?: number) {
  if (!nps) return null
  return nps >= 1e6 ? `${(nps / 1e6).toFixed(1)}M n/s` : `${Math.round(nps / 1e3)}k n/s`
}

function ScoreBadge({ line }: { line: EngineLine }) {
  const side = favoured(line.score) ?? 'even'
  return <span className={`score-badge ${side}`}>{formatScore(line.score)}</span>
}

const PV_SHOWN = 14

interface LineProps {
  fen: string
  line: EngineLine
  onPlayLine: Props['onPlayLine']
  onPreview?: Props['onPreview']
}

// The engine sends a fresh line object many times a second, mostly with nothing visible changed.
const sameLine = (a: LineProps, b: LineProps) =>
  a.fen === b.fen &&
  a.onPlayLine === b.onPlayLine &&
  a.onPreview === b.onPreview &&
  formatScore(a.line.score) === formatScore(b.line.score) &&
  a.line.pv.slice(0, PV_SHOWN).join() === b.line.pv.slice(0, PV_SHOWN).join()

const Line = memo(function Line({ fen, line, onPlayLine, onPreview }: LineProps) {
  const sans = pvToSan(fen, line.pv.slice(0, PV_SHOWN))
  const [, side, , , , fullmove] = fen.split(' ')
  // Ply offset so that 0 = White's move; numbers go on White's moves and on the first move.
  const offset = side === 'w' ? 0 : 1
  const labelFor = (i: number) => {
    const ply = i + offset
    const number = Number(fullmove) + Math.floor(ply / 2)
    if (ply % 2 === 0) return `${number}.`
    return i === 0 ? `${number}…` : ''
  }
  return (
    <div className="engine-line">
      <ScoreBadge line={line} />
      <div className="engine-pv">
        {sans.map((san, i) => (
          <button
            key={i}
            className="pv-move"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPreview?.(null)
              onPlayLine(line.pv, i + 1)
            }}
            // The preview sits by the whole set of lines, not the move: it stays put and only its position changes.
            onMouseEnter={(e) => onPreview?.(previewAt(fen, line.pv, i + 1, e.currentTarget.closest('.engine-lines')!.getBoundingClientRect()))}
            title="Play up to here"
          >
            {labelFor(i) && <span className="pv-num">{labelFor(i)}</span>}
            {san}
          </button>
        ))}
      </div>
    </div>
  )
}, sameLine)

export function EngineLines({ fen, status, enabled, onToggle, result, searching, maxLines, terminal, reviewing, onPlayLine, onOpenSettings, onPreview }: Props) {
  const loading = status?.state === 'loading'
  const name = status?.name?.replace(/\s*(WASM|Lite|Multithreaded).*$/i, '') || 'Stockfish 19'
  let body: React.ReactNode

  if (status?.state === 'error') {
    body = <div className="engine-empty error">The engine failed to load: {status.error}</div>
  } else if (terminal) {
    body = <div className="engine-empty">{terminal.label}</div>
  } else if (!enabled) {
    body = <div className="engine-empty">Engine is off</div>
  } else if (loading) {
    const pct = Math.round((status?.progress ?? 0) * 100)
    body = (
      <div className="engine-loading">
        <span>Loading {name}…</span>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <span className="muted small">{pct > 0 ? `${pct}% of the neural network` : 'Starting up'}</span>
      </div>
    )
  } else if (reviewing && !result) {
    body = <div className="engine-empty">Paused while the game review runs</div>
  } else if (!result || !result.lines.length) {
    body = (
      <div className="engine-lines">
        {Array.from({ length: maxLines }, (_, i) => (
          <div key={i} className="engine-line skeleton" />
        ))}
      </div>
    )
  } else {
    body = (
      <div className="engine-lines" onMouseLeave={() => onPreview?.(null)}>
        {result.lines.slice(0, maxLines).map((line) => (
          <Line key={line.multipv} fen={fen} line={line} onPlayLine={onPlayLine} onPreview={onPreview} />
        ))}
      </div>
    )
  }

  return (
    <section className="engine-panel">
      <header className="engine-header">
        <label className="switch" title="Toggle engine (L)">
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span className="switch-track" />
        </label>
        <div className="engine-title">
          <span className="engine-name">{name}</span>
          <span className="engine-meta">
            {status?.multiThreaded ? `${status.threads} threads` : 'single thread'}
            {status?.name?.includes('Lite') ? ' · lite' : ' · NNUE'}
          </span>
        </div>
        <div className="engine-stats">
          {result && enabled && !terminal && (
            <>
              <span className={`depth ${searching ? 'searching' : ''}`}>depth {result.depth}</span>
              {searching && formatNps(result.nps) && <span className="muted">{formatNps(result.nps)}</span>}
            </>
          )}
        </div>
        <button className="icon-btn engine-gear" onClick={onOpenSettings} aria-label="Analysis settings" title="Analysis settings">
          <Gear />
        </button>
      </header>
      {body}
    </section>
  )
}
