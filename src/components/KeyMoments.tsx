import { useEffect, useMemo, useRef, useState } from 'react'
import { CLASS_INFO, type GameReport, type MoveClass } from '../lib/classify'
import { moveNumberLabel, type GameTree } from '../lib/tree'
import { ClassIcon } from './ClassIcon'

/** The moves that decided the game, plus the brilliant and great ones worth seeing. */
const KEY: ReadonlySet<MoveClass> = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder'])

interface Props {
  report: GameReport
  tree: GameTree
  currentId: string
  onSelect: (id: string) => void
  /** A sentence about the game, shown when there are no moments to list. */
  intro?: string
}

/** Every key moment in game order, as a row of chips that scrolls sideways (wheel, arrows, swipe). */
export function KeyMoments({ report, tree, currentId, onSelect, intro }: Props) {
  // The single most costly real error: the game's turning point, tagged on its chip.
  const turningPoint = useMemo(
    () =>
      Object.values(report.moves)
        .filter((m) => m.cls === 'blunder' || m.cls === 'mistake' || m.cls === 'miss')
        .sort((a, b) => b.loss - a.loss)[0]?.nodeId,
    [report],
  )
  const moments = useMemo(() => Object.values(report.moves).filter((m) => KEY.has(m.cls)).sort((a, b) => a.ply - b.ply), [report])

  const row = useRef<HTMLDivElement>(null)
  // Which ends have more chips past them: drives the arrows and the edge fades.
  const [more, setMore] = useState({ left: false, right: false })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => setMore({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    // A mouse wheel scrolls the row sideways (React's wheel listener is passive, so this one is ours).
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      el.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [moments.length])

  // Keep the current moment's chip in view as the review steps onto it.
  useEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>('.moment.current')
    if (!el || !chip) return
    if (chip.offsetLeft < el.scrollLeft || chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' })
  }, [currentId])

  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className="key-moments" aria-label="Key moments">
      <h3 className="section-label">Key moments</h3>
      {moments.length > 0 ? (
        <>
          {(more.left || more.right) && (
            <button className="moments-arrow" onClick={() => page(-1)} disabled={!more.left} aria-label="Earlier moments">
              ‹
            </button>
          )}
          <div ref={row} className={`moments ${more.left ? 'more-left' : ''} ${more.right ? 'more-right' : ''}`}>
            {moments.map((m) => {
              const current = m.nodeId === currentId
              const { color, label } = CLASS_INFO[m.cls]
              return (
                <button
                  key={m.nodeId}
                  className={`moment ${current ? 'current' : ''}`}
                  style={{ '--moment-color': color } as React.CSSProperties}
                  onClick={() => onSelect(m.nodeId)}
                  title={`${label} by ${m.color}${m.nodeId === turningPoint ? ', the turning point' : ''}`}
                >
                  <ClassIcon cls={m.cls} size={18} />
                  <span className="moment-num">{moveNumberLabel(m.ply)}</span>
                  <span className="moment-san">{tree.nodes[m.nodeId]?.san}</span>
                  {m.nodeId === turningPoint && <span className="moment-tag">Turning point</span>}
                </button>
              )
            })}
          </div>
          {(more.left || more.right) && (
            <button className="moments-arrow" onClick={() => page(1)} disabled={!more.right} aria-label="Later moments">
              ›
            </button>
          )}
        </>
      ) : (
        <p className="key-moments-intro">{intro}</p>
      )}
    </section>
  )
}
