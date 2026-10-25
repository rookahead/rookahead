import { memo, useMemo, useRef, useState } from 'react'
import type { PositionEval } from '../hooks/useAnalysis'
import { CLASS_INFO, NOTABLE, type GameReport } from '../lib/classify'
import { winPercent } from '../lib/evaluation'
import type { MoveNode } from '../lib/tree'

interface Props {
  line: MoveNode[]
  evals: Record<string, PositionEval>
  currentIndex: number | null
  onSelect: (id: string) => void
  report?: GameReport | null
  /** Pixel height of the plot. */
  height?: number
}

const W = 1000
const H = 100
/** Pixels kept clear above 100% and below 0%, so the line and the (enlarged) dots never touch the edge. */
const EDGE = 10

/** Plot y for a win percentage, keeping `pad` viewBox units clear at the top and bottom. */
const plotY = (win: number, pad: number) => pad + (1 - win / 100) * (H - 2 * pad)

/** Catmull-Rom spline through the points, as cubic Béziers: a smooth curve that still hits every eval. */
function smoothPath(pts: [number, number][], pad: number) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    // Clamp control points to the plot so overshoot never pokes past 0% / 100%.
    const cy = (y: number) => Math.min(H - pad, Math.max(pad, y)).toFixed(1)
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${cy(p1[1] + (p2[1] - p0[1]) / 6)}`
    d += ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${cy(p2[1] - (p3[1] - p1[1]) / 6)}`
    d += ` ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** White's winning chances over the main line: the light area is White's share. */
// Memoised: the parent re-renders with every engine update, which leaves the graph unchanged.
export const EvalGraph = memo(function EvalGraph({ line, evals, currentIndex, onSelect, report, height = 84 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const n = Math.max(line.length - 1, 1)
  const x = (i: number) => (i / n) * W
  // The SVG stretches to `height`, so a fixed pixel margin is a fraction of the viewBox.
  const pad = Math.min(H / 4, (EDGE / height) * H)

  const { area, stroke, known } = useMemo(() => {
    // While the review runs, the positions it has reached so far: the engine works back from the end
    // and the cloud forward from the start, so the graph fills in from both ends.
    const runs: [number, number][][] = []
    let run: [number, number][] = []
    for (let i = 0; i < line.length; i++) {
      const e = evals[line[i].fen]
      if (e) run.push([(i / n) * W, plotY(winPercent(e.score), pad)])
      else if (run.length) {
        runs.push(run)
        run = []
      }
    }
    if (run.length) runs.push(run)
    const paths = runs.map((r) => smoothPath(r, pad))
    return {
      area: runs.map((r, i) => `${paths[i]}L${r[r.length - 1][0]},${H}L${r[0][0]},${H}Z`).join(''),
      stroke: paths.join(''),
      known: runs.reduce((sum, r) => sum + r.length, 0),
    }
  }, [line, evals, n, pad])

  // Coloured dots for the moves worth looking at.
  const dots = useMemo(() => {
    if (!report) return []
    return line.flatMap((node, i) => {
      const r = report.moves[node.id]
      const e = evals[node.fen]
      return r && e && NOTABLE.has(r.cls) ? [{ i, cls: r.cls, top: (plotY(winPercent(e.score), pad) / H) * 100 }] : []
    })
  }, [line, report, evals, pad])

  const indexAt = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * n)
  }

  // Press and drag to scrub through the game; only report changes so each step selects once.
  const scrub = useRef<number | null>(null)
  const select = (i: number) => {
    if (i === scrub.current || !line[i]) return
    scrub.current = i
    onSelect(line[i].id)
  }

  return (
    <div
      ref={ref}
      className="eval-graph"
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        scrub.current = null
        select(indexAt(e.clientX))
      }}
      onPointerMove={(e) => {
        const i = indexAt(e.clientX)
        setHover(i)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) select(i)
      }}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="Evaluation graph across the game. Click or drag to jump to a move."
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="eval-graph-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="eval-graph-stop" stopOpacity="0.32" />
            <stop offset="1" className="eval-graph-stop" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={area} className="eval-graph-area" fill="url(#eval-graph-fill)" />
        {known > 0 && <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="eval-graph-mid" />}
        <path d={stroke} className="eval-graph-line" vectorEffect="non-scaling-stroke" />
        {currentIndex !== null && currentIndex < line.length && (
          <line x1={x(currentIndex)} x2={x(currentIndex)} y1={0} y2={H} className="eval-graph-cursor" vectorEffect="non-scaling-stroke" />
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="eval-graph-hover" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Dots are HTML so they stay round while the SVG stretches. */}
      {dots.map(({ i, cls, top }) => (
        <span
          key={i}
          className={`eval-graph-dot ${i === currentIndex ? 'current' : ''}`}
          style={{ left: `clamp(${EDGE}px, ${(i / n) * 100}%, calc(100% - ${EDGE}px))`, top: `${top}%`, background: CLASS_INFO[cls].color }}
        />
      ))}
      {known === 0 && <span className="eval-graph-empty">The evaluation graph appears once the game is reviewed</span>}
    </div>
  )
})
