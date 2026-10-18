import type { ReactNode } from 'react'
import { formatScore } from '../lib/evaluation'
import type { Score } from '../lib/uci'

interface Props {
  icon?: ReactNode
  /** Small prefix before the title, e.g. the move number. */
  kicker?: ReactNode
  title: ReactNode
  detail?: ReactNode
  score?: Score | null
  children?: ReactNode
}

/** The review's verdict for the current move (or the game): headline, eval and actions. */
export function CoachCard({ icon, kicker, title, detail, score, children }: Props) {
  return (
    <div className="coach">
      <div className="coach-head">
        {icon}
        {kicker && <span className="coach-kicker">{kicker}</span>}
        <h2 className="coach-title">{title}</h2>
        {score && <span className="eval-pill">{formatScore(score)}</span>}
      </div>
      {detail && <p className="coach-detail">{detail}</p>}
      {children && <div className="coach-actions">{children}</div>}
    </div>
  )
}
