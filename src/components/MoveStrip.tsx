import { useLayoutEffect, useRef } from 'react'
import { NOTABLE, type GameReport, type MoveClass } from '../lib/classify'
import { pathTo, type GameTree } from '../lib/tree'
import { ClassIcon } from './ClassIcon'
import { San } from './San'

interface Props {
  tree: GameTree
  currentId: string
  onSelect: (id: string) => void
  report?: GameReport | null
}

// Icons in the strip: the notable verdicts plus Best, like the move list.
const STRIP_ICONS = new Set<MoveClass>([...NOTABLE, 'best'])

/**
 * Phones: the moves in one row you swipe through, the current one kept in view. It follows the
 * line you're on: the moves that led here, then the main continuation from here.
 */
export function MoveStrip({ tree, currentId, onSelect, report }: Props) {
  const row = useRef<HTMLDivElement>(null)
  const ids = pathTo(tree, currentId)
    .slice(1)
    .map((n) => n.id)
  for (let n = tree.nodes[currentId]; n?.children.length; ) {
    n = tree.nodes[n.children[0]]
    ids.push(n.id)
  }

  // Scroll the row (only the row: scrollIntoView would move the page too) to centre the current move.
  useLayoutEffect(() => {
    const el = row.current
    const current = el?.querySelector<HTMLElement>('[data-current]')
    if (!el || !current) return
    el.scrollTo({ left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2, behavior: 'smooth' })
  }, [currentId])

  if (!ids.length) return null
  return (
    <div className="move-strip" ref={row} role="list" aria-label="Moves">
      {ids.map((id, i) => {
        const node = tree.nodes[id]
        const white = node.ply % 2 === 1
        const review = report?.moves[id]
        return (
          <button
            key={id}
            role="listitem"
            className={`move-strip-move ${id === currentId ? 'current' : ''}`}
            data-current={id === currentId || undefined}
            onClick={() => onSelect(id)}
          >
            {(white || i === 0) && (
              <span className="move-strip-num">
                {Math.ceil(node.ply / 2)}
                {white ? '.' : '…'}
              </span>
            )}
            <San san={node.san!} />
            {review && STRIP_ICONS.has(review.cls) && <ClassIcon cls={review.cls} size={16} />}
          </button>
        )
      })}
    </div>
  )
}
