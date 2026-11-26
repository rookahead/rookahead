import { useId } from 'react'
import { howItEnded, type GameDay } from '../lib/homeGames'
import { dayLabel, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { gameMedals, MEDALS } from '../lib/medals'
import { navigate } from '../lib/router'
import { speedOf } from '../lib/speed'
import { MedalIcon } from './MedalIcon'
import { COACH_HEAD } from './RookCoach'
import { Skel } from './Skeleton'
import { SpeedIcon } from './SpeedIcon'

/** Games on Home. */
export const HOME_GAMES = 3
/** Lines in a phone's list; All is a tap away. */
const PHONE_GAMES = 3


const RESULT: Record<MyGame['result'], string> = { win: 'W', loss: 'L', draw: 'D' }
/** A win's cup: a trophy whose rim is the coach's battlements, as wide as his head (its 120 grid). */
const ROOK_CUP = 'M18 18Q18 12 24 12H36Q40 12 40 16V24H50V16Q50 12 54 12H66Q70 12 70 16V24H80V16Q80 12 84 12H96Q102 12 102 18V42Q102 64 70 69V77H84Q90 77 90 83V88Q90 94 84 94H36Q30 94 30 88V83Q30 77 36 77H50V69Q18 64 18 42Z'
/** A draw's king, drawn wide on the cup's grid so it weighs the same: a cross, a broad crown, a base. */
const KING = 'M54 8H66V16H74V26H66V32H54V26H46V16H54ZM22 42Q60 26 98 42L86 78H34ZM24 82H96Q98 82 98 84V92Q98 94 96 94H24Q22 94 22 92V84Q22 82 24 82Z'

/** How a game went: the rook cup for a win, the coach knocked out (X eyes) for a loss, a king half dark and half light for a draw. */
function ResultMark({ result }: { result: MyGame['result'] }) {
  const id = useId()
  if (result === 'draw')
    return (
      <svg className="game-res draw" viewBox="12 6 96 96" aria-hidden>
        <clipPath id={id}>
          <rect x="0" y="0" width="60" height="120" />
        </clipPath>
        <path fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" d={KING} />
        <path clipPath={`url(#${id})`} d={KING} />
      </svg>
    )
  return (
    <svg className={`game-res ${result}`} viewBox="12 6 96 96" aria-hidden>
      {result === 'win' ? (
        <path d={ROOK_CUP} />
      ) : (
        <>
          <mask id={id}>
            <rect width="120" height="120" fill="#fff" />
            <path d="M37 44L53 60M53 44L37 60M67 44L83 60M83 44L67 60" stroke="#000" strokeWidth="7" strokeLinecap="round" />
          </mask>
          <path d={COACH_HEAD} mask={`url(#${id})`} />
        </>
      )}
    </svg>
  )
}

/** The hour a game ended, for rows already under their day's heading. */
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const WORD: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Drew' }

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  onOpen: (game: MyGame, review?: CachedReview) => void
  /** Your games couldn't be fetched just now (the ones from before still show). */
  error?: string
  /** Several games not reviewed yet: how many ("12", "20+"), and the way to review them in one go. */
  unreviewed?: { count: string; review: () => void }
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
 * Home's My games: your latest games as a plain list, each with when it was played, your accuracy once reviewed
 * and a badge for a Legendary move.
 */
export function HomeGames({ games, reviews, onOpen, error, unreviewed }: Props) {
  const shown = games.slice(0, HOME_GAMES)
  return (
    <>
      <header className="home-card-head">
        <h2 id="my-games">My games</h2>
        {/* Several not reviewed: review them in one go (ReviewGamesDialog), a quiet link beside All games. */}
        {unreviewed && (
          <button className="link-btn see-all review-many" onClick={unreviewed.review}>
            Review {unreviewed.count} games
          </button>
        )}
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

function GameRow({ game, review, onOpen, when = 'day' }: { game: MyGame; review?: CachedReview; onOpen: Props['onOpen']; when?: 'day' | 'time' }) {
  const opponent = game.color === 'white' ? game.black : game.white
  const mine = review?.accuracy[game.color]
  const legendary = review?.brilliant[game.color] ?? 0
  const medals = gameMedals(game, review)
  const ended = howItEnded(game)
  const at = when === 'day' ? dayLabel(game.endedAt) : TIME.format(game.endedAt)
  return (
    <button
      className="home-game"
      onClick={() => onOpen(game, review)}
      title={[ended, game.opening].filter(Boolean).join(' · ') || undefined}
      aria-label={`${WORD[game.result]} against ${opponent.name}, ${game.time}, ${at}${ended ? `, ${ended}` : ''}. ${legendary ? `${legendary} Legendary ${legendary === 1 ? 'move' : 'moves'}. ` : ''}${medals.length ? `${medals.filter((m) => m !== 'legendary').map((m) => MEDALS[m].label).join(', ')}. ` : ''}${review ? `Your accuracy ${mine != null ? mine.toFixed(1) : 'unknown'}: open the review` : 'Review it'}`}
    >
      {/* How it went, in the result's colour. */}
      <ResultMark result={game.result} />
      <span className="home-game-text">
        <span className="home-game-title">
          <strong>{opponent.name}</strong>
          {opponent.rating != null && <span className="home-game-rating">({opponent.rating})</span>}
        </span>
        <span className="home-game-detail">
          {/* How fast, as an icon (its name and the clock in its tooltip), then when. */}
          <SpeedIcon speed={speedOf(game.time, game.source)} time={game.time} />
          {at}
          {/* Not reviewed yet: said in words, in Game review's lilac; the whole row is the way to review it. */}
          {!review && (
            <>
              <span aria-hidden>·</span>
              <span className="game-to-review">To review</span>
            </>
          )}
          {/* Your accuracy once it's reviewed. */}
          {review && mine != null && (
            <>
              <span aria-hidden>·</span>
              {mine.toFixed(1)} accuracy
            </>
          )}
          {/* Its medals: the rarest, and how many more. */}
          {medals.length > 0 && (
            <span className="game-medals">
              <span aria-hidden>·</span>
              <MedalIcon medal={medals[0]} size={18} />
              {medals.length > 1 && <span className="game-medals-more">+{medals.length - 1}</span>}
            </span>
          )}
        </span>
      </span>
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
            <Skel w="22px" h="22px" className="game-res" />
            <span className="home-game-text">
              <Skel w={`${42 - (i % 3) * 6}%`} h="14px" />
              <Skel w={`${30 - (i % 2) * 6}%`} h="12px" />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
