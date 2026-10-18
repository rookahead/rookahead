import { dayLabel, SOURCE_LABEL, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'

const RESULT: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' }

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  onOpen: (game: MyGame, review?: CachedReview) => void
  /** Rows grouped under a day heading don't need their own date. */
  showDate?: boolean
  /** Column names; only the first of several stacked tables needs them. */
  showHead?: boolean
}

/** Games as table rows: where from, time control, both players, result, both accuracies, moves, date and Review/Open. */
export function GameTable({ games, reviews, onOpen, showDate = true, showHead = true }: Props) {
  return (
    <div className={`gt ${showDate ? '' : 'no-date'}`} role="table" aria-label="Games">
      <div className="gt-row gt-head" role="row" hidden={!showHead}>
        <span role="columnheader" className="gt-from">
          From
        </span>
        <span role="columnheader" className="gt-time">
          Time
        </span>
        <span role="columnheader">Players</span>
        <span role="columnheader">Result</span>
        <span role="columnheader">Accuracy</span>
        <span role="columnheader" className="gt-moves">
          Moves
        </span>
        {showDate && (
          <span role="columnheader" className="gt-date">
            Date
          </span>
        )}
        <span role="columnheader" />
      </div>
      {games.map((g) => {
        const review = reviews[g.key]
        return (
          <div className="gt-row" role="row" key={`${g.source}:${g.key}`}>
            <span role="cell" className="gt-from">
              <span className="source-tag">{SOURCE_LABEL[g.source]}</span>
            </span>
            <span role="cell" className="gt-time">
              {g.time}
            </span>
            <span role="cell" className="gt-players">
              {(['white', 'black'] as const).map((side) => (
                <span key={side} className={`gt-player ${g.color === side ? 'me' : ''}`}>
                  <span className={`gt-swatch ${side}`} aria-label={side === 'white' ? 'White' : 'Black'} />
                  <span className="gt-name">{g[side].name}</span>
                  {g[side].rating != null && <span className="gt-rating">{g[side].rating}</span>}
                </span>
              ))}
              <span className="gt-sub">
                {SOURCE_LABEL[g.source]} · {g.time}
              </span>
            </span>
            <span role="cell" className={`gt-result ${g.result}`}>
              {RESULT[g.result]}
            </span>
            <span role="cell" className="gt-accuracy">
              {review ? (
                <>
                  <span>{review.accuracy.white?.toFixed(1) ?? '–'}</span>
                  <span>{review.accuracy.black?.toFixed(1) ?? '–'}</span>
                </>
              ) : (
                <span className="gt-not-yet">Not yet</span>
              )}
            </span>
            <span role="cell" className="gt-moves">
              {g.moves}
            </span>
            {showDate && (
              <span role="cell" className="gt-date">
                {dayLabel(g.endedAt)}
              </span>
            )}
            <span role="cell">
              <button className={`btn small gt-action ${review ? 'quiet' : 'primary'}`} onClick={() => onOpen(g, review)}>
                {review ? 'Open' : 'Review'}
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
