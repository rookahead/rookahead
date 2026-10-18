import type { Color } from '../lib/evaluation'
import type { Role } from '../lib/material'
import { PieceIcon } from './PieceIcon'

interface Props {
  color: Color
  name: string
  rating?: string
  result?: string
  /** Opponent pieces this player has taken, cheapest first. */
  captured: Role[]
  /** Material lead in pawns (0 if level or behind). */
  advantage: number
}

function Captured({ pieces, color }: { pieces: Role[]; color: Color }) {
  // Group identical pieces so they overlap like a little stack.
  const groups: Role[][] = []
  for (const p of pieces) {
    const last = groups[groups.length - 1]
    if (last?.[0] === p) last.push(p)
    else groups.push([p])
  }
  return (
    <span className="captured" aria-label={`Captured: ${pieces.join(', ') || 'nothing'}`}>
      {groups.map((group, g) => (
        <span key={g} className="captured-group">
          {group.map((role, i) => (
            <span key={i} className="captured-piece">
              <PieceIcon role={role} color={color} />
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

export function PlayerBar({ color, name, rating, result, captured, advantage }: Props) {
  const opponent: Color = color === 'white' ? 'black' : 'white'
  return (
    <div className="player-bar">
      <div className={`player-avatar ${color}`} aria-hidden>
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="player-info">
        <div className="player-name">
          <span className="player-username">{name}</span>
          {rating && <span className="player-rating">{rating}</span>}
          {result && <span className="player-result">{result}</span>}
        </div>
        <div className="player-material">
          <Captured pieces={captured} color={opponent} />
          {advantage > 0 && <span className="material-lead">+{advantage}</span>}
        </div>
      </div>
    </div>
  )
}
