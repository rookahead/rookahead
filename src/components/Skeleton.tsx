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

/** Phones: Home's latest game, on its way. */
export function LatestCardSkeleton() {
  return (
    <section className="home-card accent-card latest-card compact skel-group" aria-busy aria-label="Loading your latest game">
      <div className="latest-body">
        <div className="latest-board">
          <SkelBoard />
        </div>
        <div className="latest-text">
          <Skel w="60%" h="12px" />
          <Skel w="85%" h="16px" />
          <Skel w="70%" h="12px" />
        </div>
      </div>
      <Skel w="100%" h="42px" className="skel-button" />
    </section>
  )
}

/** Learn from your mistakes (the compact card), while your mistakes are worked out from your reviews. */
export function MistakesCardSkeleton() {
  return (
    <section className="home-card mistakes-card compact skel-group" aria-busy aria-label="Loading your mistakes">
      <div className="mistakes-row">
        <span className="mistakes-board">
          <SkelBoard />
        </span>
        <div className="mistakes-text">
          <Skel w="80%" h="16px" />
          <Skel w="60%" h="12px" />
          <Skel w="70%" h="22px" className="skel-pill" />
        </div>
      </div>
      <Skel w="100%" h="42px" className="skel-button" />
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
export function DailyCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <section className="home-card daily-card compact skel-group" aria-busy aria-label="Loading the daily puzzle">
        <div className="daily-row">
          <span className="daily-board">
            <SkelBoard />
          </span>
          <div className="daily-text">
            <Skel w="60%" h="16px" />
            <Skel w="40%" h="14px" />
            <Skel w="80%" h="12px" />
            <Skel w="100%" h="36px" className="skel-button daily-go" />
          </div>
        </div>
      </section>
    )
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
          <span className="skel-line">
            <Skel w="96px" h="14px" />
          </span>
          <span className="skel-line muted">
            <Skel w="140px" h="12px" />
          </span>
        </p>
        <Skel w="72px" h="34px" className="skel-pill" />
      </div>
    </section>
  )
}
