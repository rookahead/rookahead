import { useEffect, useRef, useState } from 'react'
import { useLegendaryMoves, type LegendaryEntry } from '../hooks/useLegendaryMoves'
import { gameMedals } from '../lib/medals'
import type { MyGame } from '../lib/myGames'
import { dayLabel } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import type { BoardTheme } from '../lib/settings'
import { DefaultFace } from './DefaultFace'
import { MedalStack } from './MedalIcon'
import { Link } from './Link'
import { MiniBoard } from './MiniBoard'
import { Skel, SkelBoard } from './Skeleton'

/** Moves in the strip; the rest are on the Legendary moves page. */
const STRIP_MOVES = 10
const WORD: Record<MyGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Drew' }

interface Props {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  theme: BoardTheme
  onOpen: (move: LegendaryEntry) => void
}

/**
 * Home's Legendary moves: your latest, as cards in a row you swipe or step through, each board playing its move
 * again when you point at it or bring it into view. The row fades at an edge with more beyond it.
 */
export function LegendaryStrip({ games, reviews, theme, onOpen }: Props) {
  const { moves, loading } = useLegendaryMoves(games, reviews)
  const shown = moves.slice(0, STRIP_MOVES)
  const row = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [plays, setPlays] = useState<Record<string, number>>({})
  const replay = (id: string) => setPlays((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }))

  // Which ends have more beyond them: those fade, and get an arrow.
  useEffect(() => {
    const el = row.current
    if (!el) return
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [shown.length])

  // A card you swipe or step fully into view plays its move; the ones in view when the page arrives stay still.
  useEffect(() => {
    const el = row.current
    if (!el || !shown.length) return
    const seen = new Set<string>()
    let first = true
    const watch = new IntersectionObserver(
      (list) => {
        for (const e of list) {
          const id = (e.target as HTMLElement).dataset.id!
          if (e.isIntersecting && !seen.has(id)) {
            seen.add(id)
            if (!first) replay(id)
          } else if (!e.isIntersecting) seen.delete(id)
        }
        first = false
      },
      { root: el, threshold: 0.9 },
    )
    for (const card of el.querySelectorAll('[data-id]')) watch.observe(card)
    return () => watch.disconnect()
  }, [shown.length])

  const step = (dir: 1 | -1) => {
    const el = row.current
    const card = el?.querySelector('li')
    if (!el || !card) return
    const width = card.getBoundingClientRect().width + 12
    el.scrollBy({ left: dir * Math.max(width, Math.floor(el.clientWidth / width) * width), behavior: 'smooth' })
  }

  return (
    <section className="lstrip" aria-labelledby="lstrip-title">
      <header className="lstrip-head">
        <h2 id="lstrip-title">Legendary moves</h2>
        <Link to="/legendary" className="link-btn see-all">
          All ›
        </Link>
      </header>
      <div className={`lstrip-view ${edges.left ? 'more-left' : ''} ${edges.right ? 'more-right' : ''}`}>
        {loading && !shown.length ? (
          <ul className="lstrip-row skel-group" aria-busy aria-label="Finding your Legendary moves">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i}>
                <span className="lstrip-card">
                  <span className="lstrip-top">
                    <Skel w="36px" h="36px" className="lstrip-face" />
                    <span className="lstrip-who">
                      <Skel w="70%" h="13px" />
                      <Skel w="45%" h="11px" />
                    </span>
                  </span>
                  <Skel w="40%" h="15px" />
                  <SkelBoard />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="lstrip-row" ref={row}>
            {shown.map((m) => {
              const them = m.game.color === 'white' ? m.game.black : m.game.white
              return (
                <li key={m.id} data-id={m.id}>
                  <button className="lstrip-card" onClick={() => onOpen(m)} onPointerEnter={(e) => e.pointerType === 'mouse' && replay(m.id)} onFocus={() => replay(m.id)}>
                    <span className="lstrip-top">
                      <span className="user-avatar lstrip-face">
                        <DefaultFace name={them.name} />
                      </span>
                      <span className="lstrip-who">
                        <strong>
                          {them.name}
                          {them.rating != null && <span> ({them.rating})</span>}
                        </strong>
                        <small>
                          {dayLabel(m.game.endedAt)} · {WORD[m.game.result]}
                        </small>
                      </span>
                      <MedalStack medals={gameMedals(m.game, m.review)} size={26} />
                    </span>
                    <span className="lstrip-move">{m.label}</span>
                    <MiniBoard
                      fen={m.fen}
                      orientation={m.game.color}
                      theme={theme}
                      lastMove={[m.from, m.to]}
                      grade="brilliant"
                      play={plays[m.id] ?? 0}
                      captured={m.captured}
                      label={`${m.label} against ${them.name}`}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {edges.left && (
          <button className="lstrip-arrow left" onClick={() => step(-1)} aria-label="Earlier Legendary moves">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {edges.right && (
          <button className="lstrip-arrow right" onClick={() => step(1)} aria-label="More Legendary moves">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}
