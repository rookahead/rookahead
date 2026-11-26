import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { boardColors, boardImage } from '../../components/Board'
import { Face } from '../../components/DefaultFace'
import { Link } from '../../components/Link'
import { useAccount } from '../../lib/account'
import { chapterAt, chapterNeed } from '../../lib/puzzlePath'
import type { PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'

/** The squares the path climbs, [file, rank from the top]: up from the bottom-left corner, a turn near the top. */
const SQUARES: [number, number][] = [
  [0, 7],
  [1, 6],
  [2, 5],
  [3, 4],
  [4, 4],
  [5, 3],
  [6, 2],
  [7, 1],
  [6, 0],
]
/** Where the chapter you're on sits along the path, so the ones done stay in sight under it. */
const AT = 3

const CHECK = 'M5 12.5 10 17.5 19 7'

/** How long the path shows where you were before you hop, and the hop itself, ms. */
const HOP_WAIT = 500
const HOP_MS = 700

/**
 * Your progress where a board would be: a board in your colours, and your chapters (reached with XP) climbing it
 * square by square. Done ones ticked, you (your avatar) floating over the one you're on, the ones ahead faint. A long
 * path shows the stretch around where you are.
 *
 * `from`: a chapter you've moved on from since the path last showed you. It opens there, then you hop along to the
 * one you're on, and `onHopped` follows once you've landed.
 */
export function BoardPath({ progress, settings, from, onHopped }: { progress: PuzzleProgress; settings: Settings; from?: number; onHopped?: () => void }) {
  const { light, dark } = boardColors(settings.boardTheme, settings.palette)
  // Your photo or piece; a guest's piece comes from the name their games are under.
  const { avatarUrl, username } = useAccount()
  const name = username ?? (settings.chesscomUser || settings.lichessUser || 'you')
  const at = chapterAt(progress.xp)
  const current = at.index
  // Where you're shown: where you were, until the hop.
  const start = from != null && from < current ? Math.max(from, current - (SQUARES.length - 1 - AT)) : current
  const [shown, setShown] = useState(start)
  // The stretch of path on the board stays put through the hop, so both chapters are on it.
  const [first] = useState(() => Math.max(0, start - AT))
  const hopping = shown !== start
  const hopped = useRef(onHopped)
  useEffect(() => {
    hopped.current = onHopped
  })
  useEffect(() => {
    if (start === current) return
    const go = setTimeout(() => setShown(current), HOP_WAIT)
    const land = setTimeout(() => hopped.current?.(), HOP_WAIT + HOP_MS + 400)
    return () => {
      clearTimeout(go)
      clearTimeout(land)
    }
  }, [start, current])
  // The XP you have in the chapter shown (all of it, for one you're hopping on from).
  const xpIn = shown === current ? `${at.into} of ${at.need} XP` : `${chapterNeed(shown)} of ${chapterNeed(shown)} XP`
  const centre = ([f, r]: [number, number]) => [f + 0.5, r + 0.5]
  const square = SQUARES[Math.min(SQUARES.length - 1, Math.max(0, shown - first))]
  return (
    <section className="board-path" style={{ backgroundImage: boardImage(light, dark) } as CSSProperties} aria-label="Your puzzle path">
      <svg className="board-path-line" viewBox="0 0 8 8" aria-hidden>
        <polyline points={SQUARES.map(centre).join(' ')} />
      </svg>
      <ol>
        {SQUARES.map(([f, r], i) => {
          const chapter = first + i
          const state = chapter < shown ? 'done' : chapter === shown ? 'current' : 'ahead'
          const place = { '--f': f, '--r': r } as CSSProperties
          if (state !== 'current')
            return (
              <li key={i} className={`path-step ${state}`} style={place} aria-label={`Chapter ${chapter + 1}${state === 'done' ? ', done' : ''}`}>
                {state === 'done' ? (
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d={CHECK} />
                  </svg>
                ) : (
                  chapter + 1
                )}
              </li>
            )
          return (
            <li key={i} className="path-step current" style={place} aria-current="step">
              <Link to="/puzzles/rated" className="path-step-go" aria-label={`Chapter ${chapter + 1}: ${xpIn}. Go on`}>
                {chapter + 1}
              </Link>
              {/* On the side away from the path: left once there's room for it there. */}
              <span className={`path-step-label ${f >= 2 ? 'left' : ''}`} aria-hidden>
                <strong>Chapter {chapter + 1}</strong>
                {xpIn}
              </span>
            </li>
          )
        })}
      </ol>
      {/* You, floating over the chapter you're on (the coach is the one talking over the board). Moving on, you hop
          across to the next one. */}
      <span className={`path-me ${hopping ? 'hopping' : ''}`} style={{ '--f': square[0], '--r': square[1] } as CSSProperties} aria-hidden>
        <span className="path-step-shadow" />
        <span key={shown} className="path-me-jump">
          <span className="path-step-face player-avatar">
            <Face url={avatarUrl} name={name} />
          </span>
        </span>
      </span>
    </section>
  )
}
