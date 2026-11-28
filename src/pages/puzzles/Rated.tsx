// Rated puzzles' parts beside and under the board: your rating, run and XP, and your last twenty as rating changes.
import { Flame } from '../../components/PuzzleIcons'
import { chapterAt } from '../../lib/puzzlePath'
import { RECENT_RESULTS, type PuzzleProgress } from '../../lib/puzzleStore'

const num = (n: number) => n.toLocaleString('en-US')
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

const TICK = 'M5 12.5l4.5 4.5L19 7.5'
const CROSS = 'M6.5 6.5l11 11M17.5 6.5l-11 11'

const Mark = ({ d }: { d: string }) => (
  <svg className="rp-mark" viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)

/**
 * Your rating with the last change and the run you're on; under it your XP: what this puzzle earned once it's over,
 * the bar of your chapter in the dashboard's green with where you are and the chapter's total, and the chapter's
 * number on a flag.
 */
export function RatedScore({ progress, delta, gain }: { progress: PuzzleProgress; delta?: number; gain?: number }) {
  const { index, into, need } = chapterAt(progress.xp)
  const chapter = `Chapter ${index + 1}`
  return (
    <section className="rp-score" aria-label="Your rating">
      <div className="rp-score-top">
        <strong className="puzzle-num">{num(progress.rating)}</strong>
        {delta != null && (
          <span key={progress.played} className={`rp-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {signed(delta)}
          </span>
        )}
        <span className={`rp-run ${progress.streak ? 'lit' : ''}`} title="Rated puzzles solved in a row">
          <Flame size={16} lit={progress.streak > 0} />
          <strong>{progress.streak}</strong> in a row
        </span>
      </div>
      <div className="rp-xp">
        <div className="rp-xp-main">
          <div className="rp-xp-head">
            XP
            {gain != null && (
              <span key={progress.played} className="rp-gain">
                +{gain}
              </span>
            )}
          </div>
          <div className="rp-bar" role="progressbar" aria-label={`${chapter}: XP`} aria-valuemin={0} aria-valuemax={need} aria-valuenow={into}>
            <span style={{ width: `${(into / need) * 100}%` }} />
          </div>
          <div className="rp-xp-nums">
            <span className="rp-xp-now">{into}</span>
            <span>{need}</span>
          </div>
        </div>
        <span className="rp-flag" title={chapter} aria-label={chapter}>
          {index + 1}
        </span>
      </div>
    </section>
  )
}

/**
 * Your last twenty rated puzzles, oldest first: how far each moved your rating, in the board's blue for a solve and
 * red for a miss (a tick or a cross when Rated was off). The one on the board waits at the end as an empty pill. Once
 * no rated puzzle is waiting, a pill opens its puzzle again (`onOpen`), to play without counting; `open` is the one on
 * the board.
 */
export function RecentResults({ recent, playing, open, onOpen }: { recent: PuzzleProgress['recent']; playing: boolean; open?: string | null; onOpen?: (line: string) => void }) {
  const shown = recent.slice(-(playing ? RECENT_RESULTS - 1 : RECENT_RESULTS))
  return (
    <ol className="rp-recent" aria-label="Your last twenty">
      {shown.map((r, i) => {
        const what = r.delta != null ? signed(r.delta) : <Mark d={r.won ? TICK : CROSS} />
        const title = `${r.won ? 'Solved' : 'Missed'}${r.delta != null ? ` · ${signed(r.delta)}` : ''}`
        const line = r.line
        return (
          <li key={`${r.id}-${i}`} className={`${r.won ? 'won' : 'lost'} ${line && line === open ? 'open' : ''}`}>
            {line && onOpen && !playing ? (
              <button onClick={() => onOpen(line)} title={`${title} · Play it again`} aria-current={line === open || undefined}>
                {what}
              </button>
            ) : (
              <span title={title}>{what}</span>
            )}
          </li>
        )
      })}
      {playing && <li className="now" aria-label="This puzzle" />}
    </ol>
  )
}
