import { Fragment, memo, useEffect, useRef, type ReactNode } from 'react'
import { CLASS_INFO, NOTABLE, type GameReport, type MoveClass } from '../lib/classify'
import { ROOT_ID, type GameTree, type MoveNode } from '../lib/tree'
import { ClassIcon } from './ClassIcon'
import { San } from './San'

interface Props {
  tree: GameTree
  currentId: string
  onSelect: (id: string) => void
  result?: string
  /** When the game has been reviewed, moves get their classification icon. */
  report?: GameReport | null
}

const moveNo = (ply: number) => Math.ceil(ply / 2)
const isWhiteMove = (ply: number) => ply % 2 === 1

// Icons in the list: the notable ones plus "best" and "book", like a review sheet.
const LIST_ICONS = new Set<MoveClass>([...NOTABLE, 'best', 'book'])

interface MoveButtonProps {
  node: MoveNode
  current: boolean
  onSelect: (id: string) => void
  report?: GameReport | null
}

function MoveButton({ node, current, onSelect, report }: MoveButtonProps) {
  const review = report?.moves[node.id]
  const tint = review && NOTABLE.has(review.cls) ? CLASS_INFO[review.cls].color : undefined
  return (
    <button
      className={`move ${current ? 'current' : ''}`}
      data-current={current || undefined}
      style={tint ? { color: tint } : undefined}
      title={review ? CLASS_INFO[review.cls].label : undefined}
      // Don't take focus on click, so arrow-key navigation afterwards doesn't leave a focus ring behind.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect(node.id)}
    >
      {review && LIST_ICONS.has(review.cls) && <ClassIcon cls={review.cls} size={15} />}
      <San san={node.san!} />
    </button>
  )
}

/** A side line rendered inline: "3… Nf6 4. d3 (4. Ng5 d5) 4… Bc5". */
function Variation({ tree, startId, currentId, onSelect }: { tree: GameTree; startId: string; currentId: string; onSelect: (id: string) => void }) {
  const parts: ReactNode[] = []
  const push = (node: MoveNode, forceNumber: boolean) => {
    const white = isWhiteMove(node.ply)
    if (white || forceNumber) {
      parts.push(
        <span key={`n${node.id}`} className="var-num">
          {moveNo(node.ply)}
          {white ? '.' : '…'}
        </span>,
      )
    }
    parts.push(<MoveButton key={node.id} node={node} current={node.id === currentId} onSelect={onSelect} />)
  }

  let node = tree.nodes[startId]
  push(node, true)
  let forceNumber = false
  while (node.children.length) {
    const [main, ...alternatives] = node.children
    const next = tree.nodes[main]
    push(next, forceNumber)
    // Alternatives to `next` are written right after it, in parentheses.
    for (const alt of alternatives) {
      parts.push(
        <span key={`v${alt}`} className="subvariation">
          (<Variation tree={tree} startId={alt} currentId={currentId} onSelect={onSelect} />)
        </span>,
      )
    }
    forceNumber = alternatives.length > 0
    node = next
  }
  return <>{parts}</>
}

interface Row {
  key: string
  number: number
  white?: MoveNode
  black?: MoveNode
  /** Variations that branch off the move(s) in this row, shown underneath. */
  variations: string[]
}

/** Groups the main line into numbered rows, breaking a row wherever a variation starts. */
function buildRows(tree: GameTree): Row[] {
  const rows: Row[] = []
  let row: Row | null = null
  let parent = tree.nodes[ROOT_ID]
  while (parent.children.length) {
    const node: MoveNode = tree.nodes[parent.children[0]]
    const alternatives = parent.children.slice(1)
    if (isWhiteMove(node.ply)) {
      row = { key: node.id, number: moveNo(node.ply), white: node, variations: [] }
      rows.push(row)
    } else if (row && row.white && !row.black && !row.variations.length) {
      row.black = node
    } else {
      row = { key: node.id, number: moveNo(node.ply), black: node, variations: [] }
      rows.push(row)
    }
    // A row with variations underneath is closed: Black's reply starts a new "12… Nf6" row.
    row.variations.push(...alternatives)
    parent = node
  }
  return rows
}

// Memoised: the parent re-renders with every engine update, which leaves the list unchanged.
export const MoveList = memo(function MoveList({ tree, currentId, onSelect, result, report }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const rows = buildRows(tree)

  useEffect(() => {
    const el = container.current?.querySelector<HTMLElement>('[data-current]')
    if (!el || !container.current) return
    const box = container.current.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (r.top < box.top + 4 || r.bottom > box.bottom - 4) {
      container.current.scrollBy({ top: r.top - box.top - box.height / 2 + r.height / 2, behavior: 'smooth' })
    }
  }, [currentId])

  if (!rows.length) {
    return (
      <div className="move-list empty" ref={container}>
        <p>Make a move on the board, or load a game to analyse.</p>
      </div>
    )
  }

  return (
    <div className="move-list" ref={container}>
      {rows.map((row) => (
        <Fragment key={row.key}>
          <div className="move-row">
            <span className="move-num">{row.number}.</span>
            <span className="move-cell">
              {row.white ? (
                <MoveButton node={row.white} current={row.white.id === currentId} onSelect={onSelect} report={report} />
              ) : (
                <span className="move placeholder">…</span>
              )}
            </span>
            <span className="move-cell">
              {row.black && <MoveButton node={row.black} current={row.black.id === currentId} onSelect={onSelect} report={report} />}
            </span>
          </div>
          {row.variations.length > 0 && (
            <div className="variations">
              {row.variations.map((id) => (
                <div key={id} className="variation">
                  <Variation tree={tree} startId={id} currentId={currentId} onSelect={onSelect} />
                </div>
              ))}
            </div>
          )}
        </Fragment>
      ))}
      {result && result !== '*' && <div className="game-result">{result.replace('1/2-1/2', '½–½')}</div>}
    </div>
  )
})
