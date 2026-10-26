import { Fragment, useEffect, useRef } from 'react'
import type { Explanation } from '../lib/explain'
import { previewAt, type Preview } from './MovePreview'
import { Skel } from './Skeleton'

interface Props {
  /** "Why Rab8 is a blunder". */
  title: string
  /** Undefined while its searches run; null when there's nothing we can show for sure. */
  explanation: Explanation | null | undefined
  /** Better move in notation, for the fallback. */
  bestText?: string
  /** The row the board is showing. */
  active: number
  /** Pointing at a row: the board draws it. */
  onPick: (index: number) => void
  /** Clicking a row: the board plays its moves. */
  onPlay: (index: number) => void
  onShowLine: (index: number) => void
  onClose: () => void
  /** Pointing at a move of a line: a preview of the position after it. */
  onPreview?: (preview: Preview | null) => void
}

/** Why the move was good or bad: short rows, one idea each. Pointing at a row draws it on the board; clicking plays it. */
export function ExplainPanel({ title, explanation, bestText, active, onPick, onPlay, onShowLine, onClose, onPreview }: Props) {
  const rows =
    explanation === null
      ? [{ key: 'better', label: 'Better', text: bestText ? `${bestText} was stronger, though not for one reason we can show in a line.` : 'There’s no one reason we can show in a line.' }]
      : explanation?.rows
  // On a phone it opens below the board: bring it up to where it can be read.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ block: 'nearest' }), [])
  return (
    <section ref={ref} className="explain" aria-label={title} aria-busy={explanation === undefined}>
      <header className="explain-head">
        <h3>{title}</h3>
        <button className="explain-close" onClick={onClose} aria-label="Close" title="Back to the moves">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      {rows ? (
        rows.map((row, i) => (
          <button
            key={row.key}
            className={`explain-row${i === active ? ' active' : ''}`}
            aria-pressed={i === active}
            onMouseEnter={() => onPick(i)}
            onFocus={() => onPick(i)}
            onClick={() => onPlay(i)}
          >
            <span className={`explain-label${row.key === 'move' || row.key === 'take' ? ' san' : ''}`}>{row.label}</span>
            <span className="explain-text">{row.text}</span>
          </button>
        ))
      ) : (
        // Shaped like the rows on their way.
        <div className="skel-group">
          {['78%', '52%', '86%'].map((w) => (
            <div key={w} className="explain-row">
              <Skel w="64px" h="12px" />
              <span className="explain-text">
                <Skel w={w} h="14px" />
              </span>
            </div>
          ))}
        </div>
      )}
      {explanation?.lines.length ? (
        <div className="explain-lines" onMouseLeave={() => onPreview?.(null)}>
          {explanation.lines.map((line, i) => (
            <div key={line.label} className="explain-line">
              <span className={`explain-label${/\d/.test(line.label) ? ' san' : ''}`}>{line.label}</span>
              <span className="explain-moves">
                {/* One word per move: "21.e5", "Rd7". The preview sits by all the lines, so it stays put. */}
                {line.text.split(' ').map((word, k) => (
                  <Fragment key={k}>
                    {k > 0 && ' '}
                    <span
                      className="explain-move"
                      onMouseEnter={(e) => onPreview?.(previewAt(line.fen, line.uci, k + 1, e.currentTarget.closest('.explain-lines')!.getBoundingClientRect()))}
                    >
                      {word}
                    </span>
                  </Fragment>
                ))}
              </span>
              <button className="btn ghost small" onClick={() => onShowLine(i)}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M8 5l11 7-11 7z" />
                </svg>
                Show
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
