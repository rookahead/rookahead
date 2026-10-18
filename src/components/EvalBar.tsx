import { useState } from 'react'
import { formatScore, winPercent, type Color } from '../lib/evaluation'
import type { Score } from '../lib/uci'

interface Props {
  /** Latest trustworthy score, or null while the engine is still working on a new position. */
  score: Score | null
  orientation: Color
  /** When false (engine off and nothing reviewed) the bar rests at equal. */
  active: boolean
}

const sameScore = (a: Score | null, b: Score | null) =>
  a === b || (!!a && !!b && a.type === b.type && a.value === b.value && (a.type !== 'mate' || b.type !== 'mate' || a.mated === b.mated))

/** Compact text for the chip: "+0.3", "−7.5", "M4", "1-0". Fits inside the bar. */
function chipText(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return score.mated === 'white' ? '0-1' : score.mated === 'black' ? '1-0' : '#'
    return `${score.value < 0 ? '−' : ''}M${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  if (Math.abs(pawns) < 0.05) return '0.0'
  const abs = Math.abs(pawns)
  return `${pawns > 0 ? '+' : '−'}${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}`
}

export function EvalBar({ score, orientation, active }: Props) {
  // Hold the last score while a new position is being analysed, so the bar glides
  // from the old value to the new one instead of snapping to the middle in between.
  const [held, setHeld] = useState<Score | null>(score)
  if (score && !sameScore(score, held)) setHeld(score)
  const shown = active ? (score ?? held) : null

  const white = shown ? winPercent(shown) : 50
  // The bar fills from the bottom with the colour of whoever sits at the bottom.
  const fill = orientation === 'white' ? white : 100 - white
  // The chip marks the split, kept clear of the bar's rounded ends.
  const chipTop = Math.min(97, Math.max(3, 100 - fill))

  return (
    <div
      className={`eval-bar ${orientation === 'white' ? 'white-bottom' : 'black-bottom'}`}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={shown ? formatScore(shown) : 'No evaluation yet'}
      title={shown ? formatScore(shown) : undefined}
    >
      <div className="eval-bar-fill" style={{ transform: `scaleY(${fill / 100})` }} />
      <span className="eval-bar-chip" style={{ top: `${chipTop}%` }}>
        {shown ? chipText(shown) : '0.0'}
      </span>
    </div>
  )
}
