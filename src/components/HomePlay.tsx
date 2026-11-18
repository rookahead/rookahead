import { useMemo, useState, type ReactNode } from 'react'
import { useAccount } from '../lib/account'
import { clockLabel } from '../lib/clock'
import { useFriends } from '../lib/friends'
import { formatDay } from '../lib/home'
import { levelInfo } from '../lib/levels'
import { canPlay, connectLichess, useLichess } from '../lib/lichessAuth'
import { loadLiveOnline, ONLINE_CLOCKS, type OnlineClock } from '../lib/lichessPlay'
import type { MyGame } from '../lib/myGames'
import { askForSeek, loadOnlineSetup, saveOnlineSetup } from '../lib/onlineSetup'
import { loadLiveGame, loadSetup } from '../lib/playStore'
import { perfsFor } from '../lib/profile'
import { positionAfter, playerColor } from '../lib/puzzles'
import { navigate } from '../lib/router'
import type { BoardTheme } from '../lib/settings'
import { useDailyPuzzle } from './DailyCard'
import { TILE_ICONS } from './IconTile'
import { Link } from './Link'
import { MiniBoard } from './MiniBoard'
import { ROOK_PATH } from './RookCoach'
import { Sheet } from './Sheet'
import { AvatarFace } from './UserCard'

/** The picture tiles under the Play card: Home has all four, Play's front the two ways to play. */
export type TileId = 'friend' | 'coach' | 'daily' | 'puzzles'
const HOME_TILES: TileId[] = ['friend', 'coach', 'daily', 'puzzles']

const CLOCKS = ONLINE_CLOCKS.flatMap((g) => g.clocks.map((clock) => ({ clock, group: g.group })))

/** What Play has kept: the last setups, and a game still on its board. */
const kept = () => ({ online: loadOnlineSetup(), computer: loadSetup(), liveOnline: loadLiveOnline(), liveComputer: loadLiveGame() })

/**
 * Home's Play card, filled with your colour: an online game at the time you last picked, one press away. It says
 * instead when a game of yours is still on Play's board, or that Lichess isn't connected yet. Under it, picture
 * tiles: on Home a friend, the coach, today's puzzle and rated puzzles; on Play's front the coach and a friend. Each part keeps its height whatever
 * it has to say.
 */
export function HomePlay({ active, games, theme, tiles = HOME_TILES }: { active: boolean; games: MyGame[]; theme: BoardTheme; tiles?: TileId[] }) {
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
  // The times open in a small dialog: the card shows only the one picked.
  const [picking, setPicking] = useState(false)
  const linked = canPlay(link)
  const group = CLOCKS.find((c) => c.clock === online.clock)?.group ?? 'Rapid'
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

  return (
    <>
      <section className="home-card home-play" aria-labelledby="home-play">
        <header className="home-play-head">
          <div className="quick-lines">
            <h2 id="home-play">{playing ? 'Game in progress' : 'Play online'}</h2>
            <small>
              {liveOnline
                ? `On Lichess · you play ${liveOnline.color}`
                : liveComputer
                  ? `Level ${liveComputer.setup.level} · ${clockLabel(liveComputer.setup.clock)} · you play ${liveComputer.color}`
                  : !linked
                    ? 'Real players near your rating'
                    : rating
                      ? `Your ${group.toLowerCase()} rating: ${rating}`
                      : `As ${link?.username}`}
            </small>
          </div>
          {linked && !playing && (
            <label className="home-play-rated">
              <span className="switch">
                <input type="checkbox" role="switch" checked={online.rated} onChange={() => change({ rated: !online.rated })} />
                <span className="switch-track" />
              </span>
              Rated
            </label>
          )}
        </header>

        {playing ? (
          <div className="home-play-mid says">
            <p>{liveOnline ? 'It’s still running on Lichess, and so is your clock.' : 'It’s still on the board, where you left it.'}</p>
          </div>
        ) : linked ? (
          <button className="home-play-mid home-play-time" aria-haspopup="dialog" aria-label={`Time: ${online.clock}, ${group.toLowerCase()}. Change`} onClick={() => setPicking(true)}>
            <strong>{online.clock}</strong>
            <span>{group}</span>
            <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="home-play-mid says">
            <p>
              {link
                ? 'One more step: allow Rookahead to play games for your Lichess account.'
                : 'Connect once. Rated games count for your Lichess rating, the one on your profile.'}
            </p>
          </div>
        )}

        {playing ? (
          <button className="btn accent-btn home-play-go" onClick={() => navigate(liveOnline ? '/play/online' : '/play/computer')}>
            Back to your game
          </button>
        ) : linked ? (
          <button className="btn accent-btn home-play-go" onClick={play}>
            Play {online.clock}
          </button>
        ) : (
          <button className="btn accent-btn home-play-go" disabled={busy} onClick={() => void connectLichess()}>
            {busy ? 'Connecting…' : link ? 'Allow on Lichess' : 'Connect Lichess'}
          </button>
        )}
        {error && !linked && !playing && <p className="form-error">{error}</p>}
        {/* Whose players and clocks these are: every online game here is a Lichess game. */}
        <p className="home-play-by">Powered by Lichess</p>
        {picking && (
          <Sheet title="Time" sub="Minutes each + seconds added a move. Lichess lets apps like Rookahead play rapid and classical only." onClose={() => setPicking(false)}>
            <div className="clock-groups" role="radiogroup" aria-label="Time">
              {ONLINE_CLOCKS.map((g) => (
                <div key={g.group} className="setup-field">
                  <h3 className="setup-label">{g.group}</h3>
                  <div className="setup-tiles clock-tiles">
                    {g.clocks.map((clock) => (
                      <button
                        key={clock}
                        role="radio"
                        aria-checked={clock === online.clock}
                        className={`setup-tile ${clock === online.clock ? 'active' : ''}`}
                        onClick={(e) => {
                          change({ clock })
                          e.currentTarget.closest('dialog')?.close()
                        }}
                      >
                        {clock}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Sheet>
        )}

  </section>
      <HomeTiles tiles={tiles} theme={theme} level={`Level ${level.level} · ${level.rating}`} friend={!linked ? 'Needs Lichess' : onLichess ? `${onLichess} on Lichess` : 'By Lichess username'} playing={!!playing} />
    </>
  )
}

/**
 * The tiles under Home's Play card: each a title, a line, and a picture rising from its foot. Behind the picture,
 * faintly: "vs" between you and a friend, a board's squares under the rook and the puzzle piece. A game on the board
 * is the one Play shows, whichever way you go in, so the two ways to play wait for it.
 */
function HomeTiles({ tiles, theme, level, friend, playing }: { tiles: TileId[]; theme: BoardTheme; level: string; friend: string; playing: boolean }) {
  const { account, username } = useAccount()
  const { puzzle, done, days, rating } = useDailyPuzzle()
  const first = puzzle?.moves[0]
  const all: Record<TileId, ReactNode> = {
    friend: (
      <Link key="friend" to="/play/friend" className="home-card home-tile" inert={playing}>
        <strong>Play a friend</strong>
        <small>{friend}</small>
        <b className="home-tile-mark" aria-hidden>
          vs
        </b>
        <span className="home-tile-art tile-friend" aria-hidden>
          {/* A guest is "You", as on Play's board. */}
          <span className="player-avatar white">{account || username ? <AvatarFace account={account} /> : 'Y'}</span>
          <span className="player-avatar black">?</span>
        </span>
      </Link>
    ),
    coach: (
      <Link key="coach" to="/play/computer" className="home-card home-tile on-board" inert={playing}>
        <strong>Play the coach</strong>
        <small>{level}</small>
        <span className="home-tile-art tile-rook" aria-hidden>
          <svg viewBox="10 2 100 100">
            <path d={ROOK_PATH} />
            <ellipse cx="47" cy="60" rx="7" ry="9" />
            <ellipse cx="73" cy="60" rx="7" ry="9" />
          </svg>
        </span>
      </Link>
    ),
    daily: (
      <Link key="daily" to="/puzzles/daily" className="home-card home-tile">
        <strong>Daily puzzle</strong>
        <small>{done === 'solved' ? 'Solved · next one tomorrow' : done === 'failed' ? 'Missed · next one tomorrow' : days ? `Keeps your ${days}-day streak` : formatDay(Date.now() / 1000)}</small>
        <span className="home-tile-art tile-board" aria-hidden>
          {puzzle && first ? (
            <MiniBoard fen={positionAfter(puzzle, [first]).fen()} orientation={playerColor(puzzle)} theme={theme} lastMove={[first.slice(0, 2), first.slice(2, 4)]} />
          ) : (
            <span className="skel tile-board-blank" />
          )}
        </span>
      </Link>
    ),
    puzzles: (
      <Link key="puzzles" to="/puzzles/rated" className="home-card home-tile on-board">
        <strong>Puzzles</strong>
        <small>Rating {rating}</small>
        <span className="home-tile-art tile-piece" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d={TILE_ICONS.puzzles} />
          </svg>
        </span>
      </Link>
    ),
  }
  return (
    <nav className="home-tiles" aria-label="More to play">
      {tiles.map((t) => all[t])}
    </nav>
  )
}
