import { useMemo, useState } from 'react'
import { clockLabel } from '../lib/clock'
import { useFriends } from '../lib/friends'
import { levelInfo } from '../lib/levels'
import { canPlay, connectLichess, useLichess } from '../lib/lichessAuth'
import { loadLiveOnline, ONLINE_CLOCKS, type OnlineClock } from '../lib/lichessPlay'
import type { MyGame } from '../lib/myGames'
import { askForSeek, loadOnlineSetup, saveOnlineSetup } from '../lib/onlineSetup'
import { loadLiveGame, loadSetup } from '../lib/playStore'
import { perfsFor } from '../lib/profile'
import { navigate } from '../lib/router'
import { IconTile } from './IconTile'
import { Link } from './Link'

const CLOCKS = ONLINE_CLOCKS.flatMap((g) => g.clocks.map((clock) => ({ clock, group: g.group })))

/** What Play has kept: the last setups, and a game still on its board. */
const kept = () => ({ online: loadOnlineSetup(), computer: loadSetup(), liveOnline: loadLiveOnline(), liveComputer: loadLiveGame() })

/**
 * Home's Play card: an online game at the time you last picked, one press away, with the computer and a friend
 * under it. It says instead when a game of yours is still on Play's board, or that Lichess isn't connected yet.
 * Each part keeps its height whatever the card has to say.
 */
export function HomePlay({ active, games }: { active: boolean; games: MyGame[] }) {
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
    <section className="home-card home-play" aria-labelledby="home-play">
      <header className="home-play-head">
        <IconTile tone="play" size="big" />
        <div className="quick-lines">
          <h2 id="home-play">{playing ? 'Game in progress' : 'Play online'}</h2>
          <small>
            {liveOnline
              ? `On Lichess · you play ${liveOnline.color}`
              : liveComputer
                ? `Level ${liveComputer.setup.level} · ${clockLabel(liveComputer.setup.clock)} · you play ${liveComputer.color}`
                : !linked
                  ? 'Real players, through Lichess'
                  : rating
                    ? `${group} ${rating} on Lichess`
                    : `On Lichess as ${link?.username}`}
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
        <div className="home-play-mid" role="radiogroup" aria-label="Time">
          {CLOCKS.map((c) => (
            <button
              key={c.clock}
              role="radio"
              aria-checked={c.clock === online.clock}
              aria-label={`${c.clock}, ${c.group.toLowerCase()}`}
              title={c.group}
              className={`setup-tile ${c.clock === online.clock ? 'active' : ''}`}
              onClick={() => change({ clock: c.clock })}
            >
              {c.clock}
            </button>
          ))}
        </div>
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
        <button className="btn primary home-play-go" onClick={() => navigate(liveOnline ? '/play/online' : '/play/computer')}>
          Back to your game
        </button>
      ) : linked ? (
        <button className="btn primary home-play-go" onClick={play}>
          Play {online.clock}
        </button>
      ) : (
        <button className="btn primary home-play-go" disabled={busy} onClick={() => void connectLichess()}>
          {busy ? 'Connecting…' : link ? 'Allow on Lichess' : 'Connect Lichess'}
        </button>
      )}
      {error && !linked && !playing && <p className="form-error">{error}</p>}

      {/* A game on the board is the one Play shows, whichever way you go in. */}
      <nav className="home-play-ways" aria-label="Other ways to play" inert={!!playing}>
        <Link to="/play/computer" className="home-play-way">
          <IconTile tone="computer" />
          <span>
            <strong>Computer</strong>
            <small>
              Level {level.level} · {level.rating}
            </small>
          </span>
        </Link>
        <Link to="/play/friend" className="home-play-way">
          <IconTile tone="friend" />
          <span>
            <strong>A friend</strong>
            <small>{!linked ? 'Needs Lichess' : onLichess ? `${onLichess} on Lichess` : 'By Lichess username'}</small>
          </span>
        </Link>
      </nav>
    </section>
  )
}
