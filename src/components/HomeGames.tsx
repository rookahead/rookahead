import { useEffect, useMemo, useState } from 'react'
import { CLASS_INFO } from '../lib/classify'
import { gameDays, howItEnded, moveQuality, type GameDay, type Quality } from '../lib/homeGames'
import { finalPosition, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import type { BoardTheme } from '../lib/settings'
import { decodedSaved, decodeSaved, type SharedGame } from '../lib/share'
import { IconTile } from './IconTile'
import { MiniBoard } from './MiniBoard'
import { Skel, SkelBoard } from './Skeleton'

/** Games on Home. */
export const HOME_GAMES = 6

type Filter = 'all' | 'unreviewed' | 'loss'

const RESULT: Record<MyGame['result'], string> = { win: 'W', loss: 'L', draw: 'D' }
const WORD: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Drew' }

/** The strip's colours: the verdicts' own (the engine's top moves and the good ones as one green). */
const QUALITY: [Quality, string, string][] = [
  ['book', CLASS_INFO.book.label, CLASS_INFO.book.color],
  ['good', 'Good', CLASS_INFO.best.color],
  ['clutch', CLASS_INFO.great.label, CLASS_INFO.great.color],
  ['legendary', CLASS_INFO.brilliant.label, CLASS_INFO.brilliant.color],
  ['slip', CLASS_INFO.inaccuracy.label, CLASS_INFO.inaccuracy.color],
  ['mistake', CLASS_INFO.mistake.label, CLASS_INFO.mistake.color],
  ['blunder', CLASS_INFO.blunder.label, CLASS_INFO.blunder.color],
]
const COLOR = Object.fromEntries(QUALITY.map(([q, , c]) => [q, c])) as Record<Quality, string>

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  theme: BoardTheme
  onOpen: (game: MyGame, review?: CachedReview) => void
  /** Your games couldn't be fetched just now (the ones from before still show). */
  error?: string
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
 * Home's My games: your latest games under a heading per day (how the day went, and your rating through it),
 * each reviewed one with its moves as a strip of colours, and chips to see only the ones still to review, or
 * your losses.
 */
export function HomeGames({ games, reviews, theme, onOpen, error }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const unreviewed = games.filter((g) => !reviews[g.key]).length
  const losses = games.filter((g) => g.result === 'loss').length
  const shown = games.filter((g) => (filter === 'unreviewed' ? !reviews[g.key] : filter === 'loss' ? g.result === 'loss' : true)).slice(0, HOME_GAMES)
  const days = gameDays(shown, games)
  const chip = (id: Filter, label: string, count?: number) => (
    <button role="radio" aria-checked={filter === id} className={`filter-chip ${id === 'unreviewed' ? 'all' : id} ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
      {label}
      {count != null && <span className="filter-count">{count}</span>}
    </button>
  )

  return (
    <>
      <header className="home-card-head">
        <IconTile tone="games" />
        <h2 id="my-games">My games</h2>
        <div className="filter-chips home-games-chips" role="radiogroup" aria-label="Show">
          {chip('all', 'All')}
          {chip('unreviewed', 'Not reviewed', unreviewed)}
          {chip('loss', 'Losses', losses)}
        </div>
        <button className="link-btn see-all" onClick={() => navigate('/games')}>
          All games ›
        </button>
      </header>
      {error && <p className="games-error">{error}</p>}
      {days.length ? (
        <GameDays days={days} reviews={reviews} theme={theme} onOpen={onOpen} />
      ) : (
        <p className="home-games-none">{filter === 'unreviewed' ? 'Every one of your games is reviewed.' : 'No losses among your games.'}</p>
      )}
      {shown.some((g) => reviews[g.key]) && <QualityKey />}
    </>
  )
}

/** Games under a heading per day: how the day went, and your rating through it. */
export function GameDays({ days, reviews, theme, onOpen }: { days: GameDay[]; reviews: Record<string, CachedReview>; theme: BoardTheme; onOpen: Props['onOpen'] }) {
  return days.map((day) => (
    <section key={day.label} className="home-day" aria-label={day.label}>
      <h3 className="home-day-head">
        <b>{day.label}</b>
        <span>{daySummary(day)}</span>
      </h3>
      <ul className="home-games">
        {day.games.map((g) => (
          <li key={`${g.source}:${g.key}`}>
            <GameRow game={g} review={reviews[g.key]} theme={theme} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  ))
}

/** What the strips' colours stand for. */
export function QualityKey() {
  return (
    <ul className="quality-key" aria-label="Colours">
      {QUALITY.map(([q, label, color]) => (
        <li key={q}>
          <i style={{ background: color }} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** A saved review's game, at once when it's been decoded already this session, else once it has been. */
function useDecoded(token: string | undefined): SharedGame | null | undefined {
  const [decoded, setDecoded] = useState<{ token: string; game: SharedGame | null }>()
  useEffect(() => {
    if (!token || decodedSaved(token) !== undefined) return
    let live = true
    void decodeSaved(token).then((game) => live && setDecoded({ token, game }))
    return () => {
      live = false
    }
  }, [token])
  if (!token) return null
  const known = decodedSaved(token)
  return known !== undefined ? known : decoded?.token === token ? decoded.game : undefined
}

function GameRow({ game, review, theme, onOpen }: { game: MyGame; review?: CachedReview; theme: BoardTheme; onOpen: Props['onOpen'] }) {
  const opponent = game.color === 'white' ? game.black : game.white
  const final = finalPosition(game)
  const shared = useDecoded(review?.token)
  const quality = useMemo(() => (shared ? moveQuality(shared, game.color) : null), [shared, game.color])
  const mine = review?.accuracy[game.color]
  const theirs = review?.accuracy[game.color === 'white' ? 'black' : 'white']
  // The opening last: a long name is what gets cut short.
  const detail = [game.time, howItEnded(game), game.opening].filter(Boolean).join(' · ')
  return (
    <button
      className="home-game"
      onClick={() => onOpen(game, review)}
      aria-label={`${WORD[game.result]} against ${opponent.name}, ${detail}. ${review ? `Your accuracy ${mine != null ? mine.toFixed(1) : 'unknown'}: open the review` : 'Review it'}`}
    >
      <span className="home-game-board" aria-hidden>
        {final && <MiniBoard fen={final.fen} orientation={game.color} theme={theme} lastMove={final.lastMove} />}
        <i className={`home-game-result ${game.result}`}>{RESULT[game.result]}</i>
      </span>
      <span className="home-game-text">
        <span className="home-game-title">
          <strong>{opponent.name}</strong>
          {opponent.rating != null && <span> {opponent.rating}</span>}
        </span>
        <span className="home-game-detail">{detail}</span>
      </span>
      <span className="home-game-moves">
        {review ? (
          <span className="quality-strip" aria-hidden>
            {quality?.moves.map((q, i) => <i key={i} style={{ background: COLOR[q] }} />)}
          </span>
        ) : (
          <span className="quality-strip empty" aria-hidden />
        )}
        <span className="home-game-under">
          {review ? (
            <>
              <span>
                You <b>{mine != null ? mine.toFixed(1) : '–'}</b> · them {theirs != null ? theirs.toFixed(1) : '–'}
              </span>
              <span>{quality?.note}</span>
            </>
          ) : (
            <>
              <span>Not reviewed yet</span>
              <span>
                {game.moves} {game.moves === 1 ? 'move' : 'moves'}
              </span>
            </>
          )}
        </span>
      </span>
      {review ? <span className="home-game-open">Open ›</span> : <span className="game-card-review">Review</span>}
    </button>
  )
}

/** Home's games on their way: a day's heading and rows the shape of the real ones, and the colours' key below
 * when some of them will have been reviewed. */
export function HomeGamesSkeleton({ reviewed = false }: { reviewed?: boolean }) {
  return (
    <div className="skel-group" aria-busy aria-label="Loading your games">
      <header className="home-card-head">
        <IconTile tone="games" />
        <h2>My games</h2>
        <span className="filter-chips home-games-chips">
          <Skel w="44px" h="30px" className="skel-pill" />
          <Skel w="118px" h="30px" className="skel-pill" />
          <Skel w="84px" h="30px" className="skel-pill" />
        </span>
      </header>
      <GameDaysSkeleton rows={HOME_GAMES} />
      {reviewed && (
        <ul className="quality-key">
          <li>
            <Skel w="320px" h="10px" />
          </li>
        </ul>
      )}
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
      <ul className="home-games">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>
            <span className="home-game">
              <span className="home-game-board">
                <SkelBoard />
              </span>
              <span className="home-game-text">
                <Skel w={`${58 - (i % 3) * 8}%`} h="14px" />
                <Skel w={`${72 - (i % 2) * 12}%`} h="11px" />
              </span>
              <span className="home-game-moves">
                <Skel w="100%" h="14px" />
                <Skel w="70%" h="11px" />
              </span>
              <span className="home-game-open" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
