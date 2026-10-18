import { useMemo } from 'react'
import { CLASS_INFO, type GameReport, type MoveClass } from '../lib/classify'
import { moveNumberLabel, type GameTree } from '../lib/tree'
import { ClassIcon } from './ClassIcon'

/** The moves that decided the game, plus the brilliant and great ones worth seeing. */
const KEY: ReadonlySet<MoveClass> = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder'])
const MAX = 6

interface Props {
  report: GameReport
  tree: GameTree
  currentId: string
  onSelect: (id: string) => void
  /** A sentence about the game, shown above the moments. */
  intro?: string
}

export function KeyMoments({ report, tree, currentId, onSelect, intro }: Props) {
  const moments = useMemo(() => {
    const key = Object.values(report.moves).filter((m) => KEY.has(m.cls))
    // Keep the most important ones (biggest swings, plus every brilliant), shown in game order.
    const ranked = [...key].sort((a, b) => (b.cls === 'brilliant' ? 1 : 0) - (a.cls === 'brilliant' ? 1 : 0) || b.loss - a.loss)
    return ranked.slice(0, MAX).sort((a, b) => a.ply - b.ply)
  }, [report])

  if (!moments.length && !intro) return null
  return (
    <section className="info-section key-moments" aria-label="Key moments">
      <h3 className="section-label">Key moments</h3>
      {intro && <p className="key-moments-intro">{intro}</p>}
      {moments.length > 0 && (
        <div className="moments">
          {moments.map((m) => {
            const current = m.nodeId === currentId
            const { color, label } = CLASS_INFO[m.cls]
            return (
              <button
                key={m.nodeId}
                className={`moment ${current ? 'current' : ''}`}
                style={current ? { boxShadow: `inset 2px 0 0 ${color}` } : undefined}
                onClick={() => onSelect(m.nodeId)}
                title={`${label} by ${m.color}`}
              >
                <ClassIcon cls={m.cls} size={18} />
                <span className="moment-num">{moveNumberLabel(m.ply)}</span>
                <span className="moment-san">{tree.nodes[m.nodeId]?.san}</span>
                <span className="moment-cls" style={{ color }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
