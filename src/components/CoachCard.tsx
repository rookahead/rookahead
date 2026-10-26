import { Fragment, type ReactNode } from 'react'
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
  /** "Report this verdict": a quiet flag ("Disagree?") in the title row, always in the same spot. */
  onReport?: () => void
  /** This verdict has been reported already (this visit). */
  reported?: boolean
  /**
   * Stepping through a review: the title keeps to one line and the note to two, and the actions are
   * one row, Next move always in its right half, so nothing moves from move to move.
   */
  stepping?: boolean
  /** Changes with the move shown: the card stays put and only its words come in again, one after another. */
  textKey?: string
}

/** Each word of `text` comes in after the one before it, as if being written; numbered on from `from`. */
function Words({ text, from }: { text: string; from: number }) {
  let i = from
  return (
    <>
      {text.split(/(\s+)/).map((part, k) =>
        /^\s+$/.test(part) || !part ? (
          <Fragment key={k}>{part}</Fragment>
        ) : (
          <span key={k} className="coach-word" style={{ '--i': i++ } as React.CSSProperties}>
            {part}
          </span>
        ),
      )}
    </>
  )
}

const wordCount = (node: ReactNode) => (typeof node === 'string' ? node.split(/\s+/).filter(Boolean).length : 1)

/** The review's verdict for the current move (or the game): headline, eval and actions. */
export function CoachCard({ icon, kicker, title, detail, score, children, onReport, reported, stepping, textKey }: Props) {
  // The title's words first, then the note's.
  const typedTitle = textKey !== undefined && typeof title === 'string' ? <Words text={title} from={0} /> : title
  const typedDetail = textKey !== undefined && typeof detail === 'string' ? <Words text={detail} from={wordCount(title)} /> : detail
  return (
    <div className={`coach${stepping ? ' stepping' : ''}`}>
      <div className="coach-head" key={`head:${textKey}`}>
        {icon}
        {kicker && <span className="coach-kicker">{kicker}</span>}
        <h2 className="coach-title">{typedTitle}</h2>
        {onReport && (
          <button
            className="coach-report"
            onClick={onReport}
            disabled={reported}
            aria-label={reported ? 'Reported' : 'Disagree?'}
            title={reported ? 'Reported. Thanks, we’ll take a look.' : 'Disagree? Think this verdict is wrong? Tell us.'}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
            </svg>
          </button>
        )}
        {score && <span className="eval-pill">{formatScore(score)}</span>}
      </div>
      {(detail || stepping) && (
        <p className="coach-detail" key={`note:${textKey}`}>
          {typedDetail}
        </p>
      )}
      {children && <div className={`coach-actions${stepping ? ' row' : ''}`}>{children}</div>}
    </div>
  )
}
