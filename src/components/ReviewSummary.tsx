import { useEffect, useState } from 'react'
import { CLASS_INFO, CLASS_ORDER, type GameReport } from '../lib/classify'
import type { Color } from '../lib/evaluation'
import type { PgnHeaders } from '../lib/tree'
import { ClassIcon } from './ClassIcon'

const playerName = (headers: PgnHeaders, c: Color) => headers[c === 'white' ? 'White' : 'Black'] || (c === 'white' ? 'White' : 'Black')

/** Counts from 0 up to `target` over `ms`, easing out; shows it straight away for reduced motion. */
function useCountUp(target: number | null, ms = 700) {
  const [value, setValue] = useState(0)
  const animate = target !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!animate) return
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / ms, 1)
      setValue(target * (1 - (1 - t) ** 3))
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [animate, target, ms])
  return animate ? value : target
}

interface Props {
  report: GameReport
  headers: PgnHeaders
}

/**
 * The scores as a face-off: White's column on the left, Black's on the right, and the
 * row names down the middle, so every number sits under the player it belongs to.
 */
export function ReviewSummary({ report, headers }: Props) {
  const shown = { white: useCountUp(report.accuracy.white), black: useCountUp(report.accuracy.black) }
  const accuracy = (c: Color) => (shown[c] === null ? '–' : shown[c].toFixed(1))
  return (
    <div className="summary" role="table" aria-label="Accuracy and move grades by player">
      <div className="faceoff-row names" role="row">
        <span role="columnheader" className="faceoff-name">
          {playerName(headers, 'white')}
        </span>
        <span role="columnheader" />
        <span role="columnheader" className="faceoff-name">
          {playerName(headers, 'black')}
        </span>
      </div>
      <div className="faceoff-row scores" role="row">
        <span role="cell" className="faceoff-score white">
          {accuracy('white')}
        </span>
        <span role="rowheader" className="faceoff-caption">
          Accuracy
        </span>
        <span role="cell" className="faceoff-score black">
          {accuracy('black')}
        </span>
      </div>

      <div className="grades">
        {CLASS_ORDER.map((cls) => {
          const w = report.counts.white[cls]
          const b = report.counts.black[cls]
          const color = CLASS_INFO[cls].color
          return (
            <div key={cls} className={`faceoff-row grade ${w + b === 0 ? 'zero' : ''}`} role="row">
              <span className="count" role="cell" style={w ? { color } : undefined}>
                {w}
              </span>
              <span className="grade-label" role="rowheader">
                <ClassIcon cls={cls} size={18} />
                {CLASS_INFO[cls].label}
              </span>
              <span className="count" role="cell" style={b ? { color } : undefined}>
                {b}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
