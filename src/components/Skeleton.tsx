import type { CSSProperties } from 'react'

/**
 * Grey placeholders shaped like the content that's on its way, shimmering as one wave across the page.
 * They fade in only after a moment, so content that arrives quickly never flashes them.
 */

/** One placeholder bar or block. `w` and `h` take any CSS length. */
export function Skel({ w, h, className = '' }: { w?: string; h?: string; className?: string }) {
  const style: CSSProperties = { width: w, height: h }
  return <span className={`skel ${className}`} style={style} aria-hidden />
}

/** A board's placeholder: a square with a faint checkerboard. */
export function SkelBoard({ className = '' }: { className?: string }) {
  return <span className={`skel skel-board ${className}`} aria-hidden />
}

/** Rows of games on their way, shaped like GameList's cards. */
export function GameListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="game-cards skel-group" aria-busy aria-label="Loading your games">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className="game-card skel-card">
            <span className="game-card-board">
              <SkelBoard />
            </span>
            <span className="game-card-text">
              <Skel w={`${58 - (i % 3) * 8}%`} h="14px" />
              <Skel w={`${42 + (i % 2) * 10}%`} h="11px" />
            </span>
            <span className="game-card-accuracy">
              <Skel w="40px" h="20px" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Home's latest game, on its way. */
export function LatestCardSkeleton() {
  return (
    <section className="home-card accent-card latest-card skel-group" aria-busy aria-label="Loading your latest game">
      <div>
        <Skel w="62%" h="20px" />
        <Skel w="44%" h="12px" className="skel-gap" />
      </div>
      <div className="latest-body">
        <div className="latest-board">
          <SkelBoard />
        </div>
        <div className="latest-text">
          <Skel w="30%" h="14px" />
          <Skel w="80%" h="16px" />
          <Skel w="70%" h="12px" />
          <Skel w="56%" h="12px" />
        </div>
      </div>
      <Skel w="100%" h="48px" className="skel-button" />
    </section>
  )
}

/** Home's row of Legendary moves, on its way. */
export function LegendaryRowSkeleton() {
  return (
    <section className="home-card legendary-strip skel-group" aria-busy aria-label="Loading your Legendary moves">
      <header className="home-card-head">
        <Skel w="46%" h="18px" />
      </header>
      <ul className="legendary-row">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span className="legendary-card">
              <SkelBoard />
              <Skel w="60%" h="12px" className="skel-gap" />
              <Skel w="80%" h="10px" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The Legendary page's cards, on their way. */
export function LegendaryGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ul className="legendary-grid skel-group" aria-busy aria-label="Finding your Legendary moves">
      {Array.from({ length: cards }, (_, i) => (
        <li key={i}>
          <span className="legendary-card">
            <Skel w="64%" h="13px" />
            <SkelBoard />
            <Skel w="52%" h="13px" />
            <Skel w="40%" h="12px" />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The daily puzzle, on its way. */
export function DailyCardSkeleton() {
  return (
    <section className="home-card daily-card skel-group" aria-busy aria-label="Loading the daily puzzle">
      <header className="daily-head">
        <Skel w="28px" h="28px" />
        <Skel w="44%" h="18px" />
        <Skel w="64px" h="26px" className="skel-pill" />
      </header>
      <span className="daily-board">
        <SkelBoard />
      </span>
      <div className="daily-foot">
        <p>
          <Skel w="96px" h="14px" />
          <Skel w="140px" h="12px" />
        </p>
        <Skel w="72px" h="34px" className="skel-pill" />
      </div>
    </section>
  )
}
