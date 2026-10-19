import { dayLabel, finalPosition, SOURCE_LABEL, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import type { BoardTheme } from '../lib/settings'
import { MiniBoard } from './MiniBoard'

const RESULT: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' }

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  theme: BoardTheme
  onOpen: (game: MyGame, review?: CachedReview) => void
  /** Rows grouped under a day heading don't need their own date. */
  showDate?: boolean
}

/** Games as cards: where it ended, who you played and how, and your accuracy (or the way to review it). */
export function GameList({ games, reviews, theme, onOpen, showDate = true }: Props) {
  return (
    <ul className="game-cards">
      {games.map((g) => {
        const review = reviews[g.key]
        const accuracy = review?.accuracy[g.color]
        const opponent = g.color === 'white' ? g.black : g.white
        const final = finalPosition(g)
        const detail = [SOURCE_LABEL[g.source], g.time, `${g.moves} ${g.moves === 1 ? 'move' : 'moves'}`, showDate && dayLabel(g.endedAt)].filter(Boolean).join(' · ')
        return (
          <li key={`${g.source}:${g.key}`}>
            <button className="game-card" onClick={() => onOpen(g, review)}>
              <span className="game-card-board" aria-hidden>
                {final && <MiniBoard fen={final.fen} orientation={g.color} theme={theme} lastMove={final.lastMove} />}
              </span>
              <span className="game-card-text">
                <span className="game-card-title">
                  <span className={`game-card-result ${g.result}`}>{RESULT[g.result]}</span> vs <strong>{opponent.name}</strong>
                  {opponent.rating != null && <span className="game-card-rating"> {opponent.rating}</span>}
                </span>
                <span className="game-card-detail">{detail}</span>
              </span>
              {review ? (
                <span className="game-card-accuracy">
                  <b>{accuracy != null ? accuracy.toFixed(1) : '–'}</b>
                  <small>accuracy</small>
                </span>
              ) : (
                <span className="game-card-review">Review</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
