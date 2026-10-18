import { formatTimeControl } from '../lib/chesscom'
import type { PgnHeaders } from '../lib/tree'

interface Props {
  headers: PgnHeaders
  hasGame: boolean
  opening?: { eco?: string; name: string }
  /** On a fresh board, in place of the game details: "White to move", "Checkmate". */
  positionNote: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026.10.15" → "15 Oct 2026"; unknown parts ("2026.??.??") fall back to what is known. */
function formatPgnDate(date?: string): string | undefined {
  const [y, m, d] = (date ?? '').split('.').map(Number)
  if (!y) return undefined
  if (!m) return String(y)
  return `${d ? `${d} ` : ''}${MONTHS[m - 1]} ${y}`
}

/** Time-control buckets: estimated game length is base + 40 × increment. */
function speedOf(tc: string): string | undefined {
  if (tc.includes('/')) return 'Daily'
  const [base, inc = 0] = tc.split('+').map(Number)
  if (!Number.isFinite(base)) return undefined
  const estimate = base + 40 * inc
  return estimate < 180 ? 'Bullet' : estimate < 600 ? 'Blitz' : 'Rapid'
}

/** "MelonLord-009 won by checkmate" → "Checkmate", "… won on time" → "On time", "Game drawn by repetition" → "Repetition". */
function howItEnded(termination?: string): string | undefined {
  if (!termination) return undefined
  const m = termination.match(/\b(?:won|drawn)\s+(by|on)\s+(.+)$/i)
  // "by checkmate" → "Checkmate", but "on time" keeps its "on".
  const how = m ? (m[1].toLowerCase() === 'on' ? `on ${m[2]}` : m[2]) : termination
  return how.charAt(0).toUpperCase() + how.slice(1)
}

/** "Petrov's Defense: Damiano Variation, Kholmov Gambit" → family + the rest. */
function splitOpening(name: string): [string, string | undefined] {
  const colon = name.indexOf(':')
  return colon < 0 ? [name, undefined] : [name.slice(0, colon), name.slice(colon + 1).trim()]
}

/**
 * The game's header, laid out like the top of a scoresheet: the opening as the headline,
 * then the facts a PGN's tags carry (time control, date, result, where it was played).
 */
export function GameInfo({ headers, hasGame, opening, positionNote }: Props) {
  const tc = headers.TimeControl && headers.TimeControl !== '-' ? headers.TimeControl : undefined
  const result = headers.Result && headers.Result !== '*' ? headers.Result.replace('1/2', '½').replace('-', '–') : undefined
  const link = headers.Link?.startsWith('https://') ? headers.Link : undefined
  const [family, variation] = opening ? splitOpening(opening.name) : [undefined, undefined]

  const fields: [string, React.ReactNode][] = []
  if (hasGame) {
    if (tc) fields.push(['Time', [formatTimeControl(tc), speedOf(tc)].filter(Boolean).join(' ')])
    const date = formatPgnDate(headers.Date)
    if (date) fields.push(['Date', date])
    if (result)
      fields.push([
        'Result',
        <span key="result" className="gi-result" title={headers.Termination}>
          <span className="result-pill">{result}</span>
          {howItEnded(headers.Termination)}
        </span>,
      ])
    if (link)
      fields.push([
        'Source',
        <a key="source" className="gi-link" href={link} target="_blank" rel="noreferrer">
          Original game
          <span aria-hidden> ↗</span>
        </a>,
      ])
  } else {
    fields.push(['Turn', positionNote])
  }

  return (
    <>
      <section className="info-section gi-opening" aria-label="Opening">
        {opening?.eco && <span className="gi-eco">{opening.eco}</span>}
        <h2 className="gi-family">{family ?? 'Unknown opening'}</h2>
        {variation && <p className="gi-variation">{variation}</p>}
      </section>

      {fields.length > 0 && (
        <section className="info-section" aria-label="Game details">
          <dl className="gi-fields">
            {fields.map(([label, value]) => (
              <div key={label} className="gi-field">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  )
}
