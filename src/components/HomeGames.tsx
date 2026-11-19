import { howItEnded, type GameDay } from '../lib/homeGames'
import { dayLabel, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { ClassIcon } from './ClassIcon'
import { Skel } from './Skeleton'

/** Games on Home. */
export const HOME_GAMES = 5
/** Lines in a phone's list; All is a tap away. */
const PHONE_GAMES = 5


const RESULT: Record<MyGame['result'], string> = { win: 'W', loss: 'L', draw: 'D' }
/** The hour a game ended, for rows already under their day's heading. */
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const WORD: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Drew' }

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  onOpen: (game: MyGame, review?: CachedReview) => void
  /** Your games couldn't be fetched just now (the ones from before still show). */
  error?: string
}

/** Phones: your latest games as plain lines, with the result, who, and your accuracy or the way to review. */
export function GameLines({ games, reviews, onOpen, error }: Pick<Props, 'games' | 'reviews' | 'onOpen' | 'error'>) {
  return (
    <>
      <header className="home-card-head">
        <h2 id="my-games">My games</h2>
      </header>
      {error && <p className="games-error">{error}</p>}
      <ul className="game-lines">
        {games.slice(0, PHONE_GAMES).map((g) => {
          const opponent = g.color === 'white' ? g.black : g.white
          const review = reviews[g.key]
          const mine = review?.accuracy[g.color]
          return (
            <li key={`${g.source}:${g.key}`}>
              <button className="game-line" onClick={() => onOpen(g, review)} aria-label={`${WORD[g.result]} against ${opponent.name}, ${g.time}. ${review ? 'Open the review' : 'Review it'}`}>
                <i className={`home-game-result ${g.result}`}>{RESULT[g.result]}</i>
                <span className="game-line-who">
                  <strong>{opponent.name}</strong>
                  {opponent.rating != null && <span> {opponent.rating}</span>}
                </span>
                <span className="game-line-time">{g.time}</span>
                {review ? <span className="game-line-end">{mine != null ? mine.toFixed(1) : 'Open'}</span> : <span className="game-line-end review">Review ›</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {/* Phones have no My games tab: the whole list opens from here. */}
      <button className="game-lines-all" onClick={() => navigate('/profile/games')}>
        All {games.length} games ›
      </button>
    </>
  )
}

/** Your games as plain lines on their way. */
export function GameLinesSkeleton() {
  return (
    <div className="skel-group" aria-busy aria-label="Loading your games">
      <header className="home-card-head">
        <h2>My games</h2>
      </header>
      <ul className="game-lines">
        {Array.from({ length: PHONE_GAMES }, (_, i) => (
          <li key={i}>
            <span className="game-line">
              <Skel w={`${64 - (i % 3) * 10}%`} h="13px" />
            </span>
          </li>
        ))}
      </ul>
      <span className="game-lines-all">
        <Skel w="96px" h="13px" />
      </span>
    </div>
  )
}

/** "6 games · 4 won, 1 lost, 1 drawn · 3 min: 3127 → 3165" */
function daySummary(day: GameDay): string {
  const results = [day.won && `${day.won} won`, day.lost && `${day.lost} lost`, day.drawn && `${day.drawn} drawn`].filter(Boolean).join(', ')
  const count = day.won + day.lost + day.drawn
  const parts = [`${count} ${count === 1 ? 'game' : 'games'}`, results]
  if (day.rating) parts.push(`${day.rating.time}: ${day.rating.from} → ${day.rating.to}`)
  return parts.join(' · ')
}

/**
 * Home's My games: your latest games as a plain list, each with when it was played, a badge for a Legendary move
 * and your accuracy once reviewed; a game still to review says so.
 */
export function HomeGames({ games, reviews, onOpen, error }: Props) {
  const shown = games.slice(0, HOME_GAMES)
  return (
    <>
      <header className="home-card-head">
        <h2 id="my-games">My games</h2>
        <button className="link-btn see-all" onClick={() => navigate('/profile/games')}>
          All games ›
        </button>
      </header>
      {error && <p className="games-error">{error}</p>}
      <ul className="home-games">
        {shown.map((g) => (
          <li key={`${g.source}:${g.key}`}>
            <GameRow game={g} review={reviews[g.key]} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  )
}

/** Games under a heading per day (how the day went, and your rating through it), each row with the hour it ended. */
export function GameDays({ days, reviews, onOpen }: { days: GameDay[]; reviews: Record<string, CachedReview>; onOpen: Props['onOpen'] }) {
  return days.map((day) => (
    <section key={day.label} className="home-day" aria-label={day.label}>
      <h3 className="home-day-head">
        <b>{day.label}</b>
        <span>{daySummary(day)}</span>
      </h3>
      <ul className="home-games">
        {day.games.map((g) => (
          <li key={`${g.source}:${g.key}`}>
            <GameRow game={g} review={reviews[g.key]} onOpen={onOpen} when="time" />
          </li>
        ))}
      </ul>
    </section>
  ))
}

/** How the game went, as the row's mark: a trophy for a win, a cross for a loss, a half for a draw. */
function ResultMark({ result }: { result: MyGame['result'] }) {
  return (
    <i className={`game-mark ${result}`} aria-hidden>
      <svg viewBox="0 0 24 24">
        {result === 'win' ? (
          <path d="M7 4h10v3a5 5 0 0 1-10 0zM7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3M12 12v4M8.5 20h7l-.8-4H9.3z" />
        ) : result === 'loss' ? (
          <path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM9 9l6 6M15 9l-6 6" />
        ) : (
          <path d="M6 9.5l2-1.5v7M5.5 15h5M18 5 6 19M13.5 11.5a2 2 0 1 1 3.5 1.3L14 17h4" />
        )}
      </svg>
    </i>
  )
}

function GameRow({ game, review, onOpen, when = 'day' }: { game: MyGame; review?: CachedReview; onOpen: Props['onOpen']; when?: 'day' | 'time' }) {
  const opponent = game.color === 'white' ? game.black : game.white
  const mine = review?.accuracy[game.color]
  const legendary = review?.brilliant[game.color] ?? 0
  const ended = howItEnded(game)
  const at = when === 'day' ? dayLabel(game.endedAt) : TIME.format(game.endedAt)
  return (
    <button
      className="home-game"
      onClick={() => onOpen(game, review)}
      title={[ended, game.opening].filter(Boolean).join(' · ') || undefined}
      aria-label={`${WORD[game.result]} against ${opponent.name}, ${game.time}, ${at}${ended ? `, ${ended}` : ''}. ${legendary ? `${legendary} Legendary ${legendary === 1 ? 'move' : 'moves'}. ` : ''}${review ? `Your accuracy ${mine != null ? mine.toFixed(1) : 'unknown'}: open the review` : 'Review it'}`}
    >
      <ResultMark result={game.result} />
      <span className="home-game-text">
        <span className="home-game-title">
          <strong>{opponent.name}</strong>
          {opponent.rating != null && <span className="home-game-rating">({opponent.rating})</span>}
        </span>
        <span className="home-game-detail">
          <svg className="home-game-clock" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2M10 2.5h4" />
          </svg>
          {game.time} · {at}
          {/* You played a Legendary move in it: its badge, and how many when more than one. */}
          {legendary > 0 && (
            <span className="home-game-legendary">
              · <ClassIcon cls="brilliant" size={18} />
              {legendary > 1 && <b>×{legendary}</b>}
            </span>
          )}
        </span>
      </span>
      <span className="home-game-acc" aria-hidden>
        {review && mine != null && (
          <>
            <b>{mine.toFixed(1)}</b>
            <small>accuracy</small>
          </>
        )}
      </span>
      <span className="home-game-go review">{!review && 'Review ›'}</span>
    </button>
  )
}

/** Home's games on their way: a day's heading and rows the shape of the real ones. */
export function HomeGamesSkeleton() {
  return (
    <div className="skel-group" aria-busy aria-label="Loading your games">
      <header className="home-card-head">
        <h2>My games</h2>
      </header>
      <GameRowsSkeleton rows={HOME_GAMES} />
    </div>
  )
}

/** A day of games on its way: its heading and rows the shape of the real ones. */
export function GameDaysSkeleton({ rows }: { rows: number }) {
  return (
    <div className="home-day">
      <h3 className="home-day-head">
        <Skel w="64px" h="13px" />
      </h3>
      <GameRowsSkeleton rows={rows} />
    </div>
  )
}

/** Rows of games on their way, the shape of the real ones. */
function GameRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="home-games">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <span className="home-game">
            <Skel w="24px" h="24px" className="skel-round game-mark" />
            <span className="home-game-text">
              <Skel w={`${42 - (i % 3) * 6}%`} h="14px" />
              <Skel w={`${30 - (i % 2) * 6}%`} h="11px" />
            </span>
            <span className="home-game-acc" />
            <span className="home-game-go-space" />
          </span>
        </li>
      ))}
    </ul>
  )
}
