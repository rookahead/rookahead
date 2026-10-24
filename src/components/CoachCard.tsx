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
  /** "Report this verdict": a "Disagree?" button at the end of the actions. */
  onReport?: () => void
  /** This verdict has been reported already (this visit). */
  reported?: boolean
  /**
   * Stepping through a review: the actions sit in three fixed slots (Show best, Next move, Disagree?)
   * under a note with room for two lines, so Next move stays in one spot from move to move.
   */
  fixed?: boolean
  /** Why the move is good or bad, under the actions so it can be any length without moving them. */
  explanation?: ReactNode
}

/** The review's verdict for the current move (or the game): headline, eval and actions. */
export function CoachCard({ icon, kicker, title, detail, score, children, onReport, reported, fixed, explanation }: Props) {
  return (
    <div className="coach">
      <div className="coach-head">
        {icon}
        {kicker && <span className="coach-kicker">{kicker}</span>}
        <h2 className="coach-title">{title}</h2>
        {score && <span className="eval-pill">{formatScore(score)}</span>}
      </div>
      {(detail || fixed) && <p className="coach-detail">{detail}</p>}
      {(children || onReport || fixed) && (
        <div className={`coach-actions${fixed ? ' fixed' : ''}`}>
          {children}
          {onReport && (
            <button
              className="btn ghost coach-report"
              onClick={onReport}
              disabled={reported}
              title={reported ? 'Thanks! We’ll take a look.' : 'Think this verdict is wrong? Tell us.'}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
              </svg>
              {reported ? 'Reported' : 'Disagree?'}
            </button>
          )}
        </div>
      )}
      {explanation && <div className="coach-explanation">{explanation}</div>}
    </div>
  )
}
