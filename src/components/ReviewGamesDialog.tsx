import { useMemo, useState } from 'react'
import { about, batchEngines, gamesInRange, MAX_BATCH, positionsOf, resetBatch, secondsPerPosition, startBatch, stopBatch, useBatchReview, type BatchRange } from '../lib/batchReview'
import type { MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import type { Settings } from '../lib/settings'
import { ConfirmDialog } from './ConfirmDialog'
import { Segmented } from './controls'
import { IconTile } from './IconTile'

const RANGES: [BatchRange, string][] = [
  ['today', 'Today'],
  ['week', '7 days'],
  ['month', '30 days'],
  ['all', 'All'],
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  settings: Settings
  onClose: () => void
}

/** Choose which games to review at once, with what it'll cost, before anything starts. */
export function ReviewGamesDialog({ games, reviews, settings, onClose }: Props) {
  // The shortest of the longer ranges that has anything in it; "Today" is a choice, not a starting point.
  const [range, setRange] = useState<BatchRange>(() => (['week', 'month'] as const).find((r) => gamesInRange(games, reviews, r).todo.length) ?? 'all')
  const { todo, waiting, reviewed } = useMemo(() => gamesInRange(games, reviews, range), [games, reviews, range])
  const seconds = secondsPerPosition({ strength: settings.engine, depth: settings.reviewDepth, engines: batchEngines() })
  const total = todo.reduce((sum, g) => sum + positionsOf(g), 0) * seconds

  return (
    <ConfirmDialog
      title="Review games"
      confirm={todo.length ? `Review ${plural(todo.length, 'game')}` : 'Review'}
      disabled={!todo.length}
      onConfirm={() => void startBatch(todo, { strength: settings.engine, depth: settings.reviewDepth, cloud: settings.cloudEvals })}
      onClose={onClose}
    >
      <div className="batch-range">
        <Segmented value={range} options={RANGES} onChange={setRange} label="Which games" />
      </div>
      <p className="batch-count">
        <strong>{todo.length ? plural(todo.length, 'game') + ' to review' : 'Nothing to review here'}</strong>
        {waiting > MAX_BATCH && <span>The newest {MAX_BATCH} of {waiting}, the most one run takes</span>}
        {reviewed > 0 && <span>{plural(reviewed, 'game')} already reviewed, skipped</span>}
      </p>
      {todo.length > 0 && (
        <>
          <p className="batch-time">{about(total)} on this device</p>
          <p className="batch-note" role="note">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 4 2.5 20h19zM12 10v5M12 17.5h.01" />
            </svg>
            <span>
              <strong>Keep this page open and on screen.</strong> Minimized or in a background tab, your browser can slow it down or pause it. If you close it, finished games stay saved and you can carry on later.
            </span>
          </p>
        </>
      )}
    </ConfirmDialog>
  )
}

/** Home's review card while games are being reviewed, the same size as the card it replaces. */
export function BatchCard() {
  const run = useBatchReview()
  const finished = run.status === 'done'
  const reviewed = run.done - run.failed
  const running = run.held ? 'Paused while the engine is busy' : `${about(run.secondsLeft)} left`
  const summary = run.failed ? `${run.failed} couldn’t be reviewed` : run.legendary ? `${plural(run.legendary, 'Legendary move')} found` : 'No Legendary moves this time'
  return (
    <div className="home-card quick-card batch-card" role="status">
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>{finished ? `${plural(reviewed, 'game')} reviewed` : `Reviewing ${Math.min(run.done + 1, run.total)} of ${run.total}`}</strong>
        <small>{finished ? summary : running}</small>
      </span>
      <button className="link-btn batch-action" onClick={finished ? resetBatch : stopBatch}>
        {finished ? 'Done' : 'Stop'}
      </button>
      {!finished && (
        <div className="progress batch-bar">
          <div className="progress-fill" style={{ width: `${run.share * 100}%` }} />
        </div>
      )}
    </div>
  )
}
