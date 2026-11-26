import { useMemo, useState, type CSSProperties } from 'react'
import { useBoardPrefs } from '../lib/boardPrefs'
import { useFriends } from '../lib/friends'
import { levelInfo } from '../lib/levels'
import { canPlay, connectLichess, useLichess } from '../lib/lichessAuth'
import { useLichessOnline } from '../lib/lichessOnline'
import { loadLiveOnline, ONLINE_CLOCKS, type OnlineClock } from '../lib/lichessPlay'
import type { MyGame } from '../lib/myGames'
import { askForSeek, loadOnlineSetup, saveOnlineSetup } from '../lib/onlineSetup'
import { loadLiveGame, loadSetup } from '../lib/playStore'
import { perfsFor } from '../lib/profile'
import { navigate } from '../lib/router'
import { useDailyPuzzle } from './DailyCard'
import { DemoBoard, LegendFlip, RookWatch, TileBoard } from './HomeArt'
import { LichessLogo } from './LichessLogo'
import { SPEED_ICON } from './SpeedIcon'
import { Link } from './Link'
import { COACH_BODY, COACH_EYE_Y, COACH_EYES } from './RookCoach'
import { boardColors } from './Board'

const CLOCKS = ONLINE_CLOCKS.flatMap((g) => g.clocks.map((clock) => ({ clock, group: g.group })))

/** What Play has kept: the last setups, and a game still on its board. */
const kept = () => ({ online: loadOnlineSetup(), computer: loadSetup(), liveOnline: loadLiveOnline(), liveComputer: loadLiveGame() })

/** Play's state for a card: what Play kept (your last online time, a game still on its board), Lichess, and ways to go. */
function usePlay(active: boolean, games: MyGame[]) {
  const { link, busy, error } = useLichess()
  const { friends } = useFriends()
  // Read again on coming back to Home: Play may have changed any of it meanwhile.
  const [state, setState] = useState(kept)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setState(kept())
  }
  const { online, computer, liveOnline, liveComputer } = state
  const linked = canPlay(link)
  const groupOf = (clock: OnlineClock) => CLOCKS.find((c) => c.clock === clock)?.group ?? 'Rapid'
  const group = groupOf(online.clock)
  // Your Lichess rating at the speed picked, from your own games there.
  const ratings = useMemo(() => perfsFor(games, 'lichess'), [games])
  const rating = ratings.find((p) => p.id === `lichess:${group.toLowerCase()}`)?.rating

  const change = (patch: { clock?: OnlineClock; rated?: boolean }) => {
    const next = { ...online, ...patch }
    saveOnlineSetup(next)
    setState({ ...state, online: next })
  }
  const play = () => {
    saveOnlineSetup(online)
    askForSeek()
    navigate('/play/online')
  }
  const level = levelInfo(computer.level)
  const onLichess = friends.filter((f) => f.status === 'accepted' && f.lichess).length
  const playing = liveOnline ?? liveComputer
  const tileText = { level: `Level ${level.level} · ${level.rating}`, friend: !linked ? 'Needs Lichess' : onLichess ? `${onLichess} on Lichess` : 'By Lichess username' }
  return { link, busy, error, online, liveOnline, liveComputer, linked, group, groupOf, rating, change, play, playing, tileText }
}

/** Rated and casual on the Play card: a trophy, and a cup. */
const TROPHY = 'M7 4h10v3a5 5 0 0 1-10 0zM7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10M12 12v4M8.5 20h7M10 16h4l.5 4h-5z'
const CUP = 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.5 1.5 1.5 1.5 3M12 3.5c0 1.5 1.5 1.5 1.5 3'

/** The top of Home's right column: your own mistakes to fix, and puzzles. `mistakesWaiting` is null while they're found. */
export function HomeTopTiles({ mistakesWaiting }: { mistakesWaiting: number | null }) {
  const { rating } = useDailyPuzzle()
  // The puzzle's board in your board's colours, as on every board you play on.
  const { boardTheme, palette } = useBoardPrefs()
  const squares = boardColors(boardTheme, palette)
  return (
    <nav className="home-grid top" aria-label="Puzzles">
      <Link to="/puzzles/mistakes" className="home-card home-tile mistakes-tile">
        <strong>Fix your mistakes</strong>
        <small>{mistakesWaiting == null ? 'From your reviews' : mistakesWaiting ? `${mistakesWaiting} waiting` : 'None waiting'}</small>
        <span className="home-tile-art">
          <LegendFlip />
        </span>
      </Link>
      <Link to="/puzzles/rated" className="home-card home-tile puzzle-tile">
        <strong>Puzzles</strong>
        <small>Rating {rating}</small>
        <span className="home-tile-art" style={{ '--sq-light': squares.light, '--sq-dark': squares.dark } as CSSProperties}>
          {/* Two puzzles, fanned: one waiting behind the one to solve. */}
          <TileBoard
            className="squares back"
            pieces={[
              { piece: 'n', at: [1, 1] },
              { piece: 'k', at: [3, 0] },
              { piece: 'B', at: [2, 3] },
              // Along its right edge, the part that shows past the front board.
              { piece: 'r', at: [4, 0] },
              { piece: 'p', at: [4, 2] },
              { piece: 'N', at: [4, 3] },
            ]}
          />
          <TileBoard
            className="squares"
            flash={[3, 0]}
            pieces={[
              { piece: 'k', at: [3, 0] },
              { piece: 'p', at: [4, 1] },
              { piece: 'r', at: [0, 1] },
              { piece: 'Q', at: [1, 3], to: [2, -2] },
              { piece: 'K', at: [3, 4] },
            ]}
          />
        </span>
      </Link>
    </nav>
  )
}

/**
 * Desktop Home's right column under Your mistakes and Puzzles (DESIGN.md): Coach and Cassie, then the blue Play
 * online card: how many are on Lichess now, your time and rated or casual (a trophy or a cup) side by side, Start,
 * and Lichess's logo under it. Each tile's picture moves while you point at it.
 */
export function HomeGrid({ active, games, place = 'home' }: { active: boolean; games: MyGame[]; place?: 'home' | 'play' }) {
  const { link, busy, error, online, liveOnline, linked, group, rating, change, play, playing, tileText } = usePlay(active, games)
  // The coach's board in your board's colours, as the Puzzles tile's is.
  const { boardTheme, palette } = useBoardPrefs()
  const squares = boardColors(boardTheme, palette)
  // The other times, open in the card under the one picked. Leaving the page closes them, so it's always found shut.
  const [picking, setPicking] = useState(false)
  if (!active && picking) setPicking(false)
  const go = playing ? () => navigate(liveOnline ? '/play/online' : '/play/computer') : linked ? play : () => void connectLichess()
  // How many are on Lichess now: the line under the title whenever it's known.
  const onLichess = useLichessOnline(active)
  const line = playing
    ? liveOnline
      ? 'Still running on Lichess, and so is your clock'
      : 'Still on the board, where you left it'
    : !linked
      ? (error ?? (link ? 'One more step: allow Rookahead on Lichess' : 'Real players near your rating'))
      : rating
        ? `Your ${group.toLowerCase()} rating: ${rating}`
        : `As ${link?.username}`
  const live = !playing && onLichess != null && !(error && !linked)
  const start = (
    <button className="btn play-card-go" onClick={go} disabled={busy}>
      {busy ? 'Connecting…' : playing ? 'Back to your game' : linked ? 'Start' : link ? 'Allow on Lichess' : 'Connect Lichess'}
    </button>
  )
  const tiles = (
    // The coach to learn with, and Cassie to play, as tall as the tiles over them.
    <nav className="home-grid top" aria-label="Learn and play">
      {/* Until the coach has a page of its own, it opens the computer. */}
      <Link to="/play/computer" className="home-card home-tile coach-tile">
        <strong>Coach</strong>
        <small>Learn with live feedback</small>
        <span className="home-tile-art">
          <DemoBoard style={{ '--sq-light': squares.light, '--sq-dark': squares.dark } as CSSProperties} />
        </span>
      </Link>
      {/* Cassie, the rook: the computer you play, at the level you last picked. */}
      <Link to="/play/computer" className="home-card home-tile computer-tile" inert={!!playing}>
        <strong>Cassie</strong>
        <small>{tileText.level}</small>
        <span className="home-tile-art tile-rook">
          <RookWatch />
        </span>
      </Link>
    </nav>
  )
  const card = (
    <section className="home-card play-card" aria-labelledby="play-card">
      <header className="play-card-head">
        <h2 id="play-card">{playing ? 'Game in progress' : 'Play online'}</h2>
        <small>
          {(live || (linked && !playing)) && <i className="tile-live" aria-hidden />}
          {live ? `${onLichess.toLocaleString('en-US')} players online` : line}
        </small>
      </header>
      {/* Your time on one side, rated or casual on the other: big, easy to hit. The time opens the other times right in
          the card, a row a speed, pushing Start down; picking one closes them. */}
      {linked && !playing && (
        <div className="play-card-controls">
          <button
            className="play-card-time"
            aria-expanded={picking}
            aria-controls="play-card-times"
            aria-label={`Time: ${online.clock}, ${group.toLowerCase()}. Change`}
            onClick={() => setPicking(!picking)}
          >
            <svg className="play-card-speed" viewBox="0 0 24 24" aria-hidden>
              <path d={SPEED_ICON[group === 'Classical' ? 'classical' : 'rapid']} />
            </svg>
            <strong>{online.clock}</strong>
            <svg className="play-card-chevron" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {/* Rated or casual: its icon and word (a trophy, a cup); the block flips it. */}
          <button
            className="play-card-rated"
            aria-pressed={online.rated}
            onClick={() => change({ rated: !online.rated })}
            title={online.rated ? 'Rated: counts for your Lichess rating. Change' : 'Casual: doesn’t count for your rating. Change'}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={online.rated ? TROPHY : CUP} />
            </svg>
            {online.rated ? 'Rated' : 'Casual'}
          </button>
        </div>
      )}
      {linked && !playing && (
        <div id="play-card-times" className={`play-card-times ${picking ? 'open' : ''}`} inert={!picking}>
          <div className="play-card-times-in" role="radiogroup" aria-label="Time">
            {ONLINE_CLOCKS.map((g) => (
              <div key={g.group} className="play-card-speed-row">
                <span className="play-card-speed-name">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d={SPEED_ICON[g.group === 'Classical' ? 'classical' : 'rapid']} />
                  </svg>
                  {g.group}
                </span>
                {g.clocks.map((clock) => (
                  <button
                    key={clock}
                    role="radio"
                    aria-checked={clock === online.clock}
                    className={`play-card-clock ${clock === online.clock ? 'on' : ''}`}
                    onClick={() => {
                      change({ clock })
                      setPicking(false)
                    }}
                  >
                    {clock}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {start}
      {/* Whose players and clocks these are: every online game here is a Lichess game. */}
      <p className="play-card-by">
        <LichessLogo />
        Powered by Lichess
      </p>
    </section>
  )
  // Coach and Cassie, then Play online, on Home and on Play's front alike; Play's front then has a friend under them.
  return (
    <>
      {tiles}
      {card}
      {place === 'play' && <FriendCard line={tileText.friend} playing={!!playing} />}
    </>
  )
}

/**
 * Play a friend, under Play online, the width of the cards: what it takes on the left, and on the right two rooks in the board's
 * two blues, leaning in and looking each other in the eye.
 */
function FriendCard({ line, playing }: { line: string; playing: boolean }) {
  return (
    <Link to="/play/friend" className="home-card friend-card" inert={playing}>
      <span className="friend-card-lines">
        <strong>Play a friend</strong>
        <small>{line}</small>
      </span>
      <span className="friend-card-art" aria-hidden>
        {(['you', 'them'] as const).map((who) => (
          <svg key={who} className={`friend-rook ${who}`} viewBox="0 0 120 120">
            <path d={COACH_BODY} />
            {COACH_EYES.map((x) => (
              <ellipse key={x} cx={x + (who === 'you' ? 7 : -7)} cy={COACH_EYE_Y} rx="7" ry="9" />
            ))}
          </svg>
        ))}
      </span>
    </Link>
  )
}


