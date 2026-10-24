/** What a tile stands for: a section of the app, or one of Home's numbers. Each has its own colour (index.css, .icon-tile). */
export type TileTone = 'play' | 'puzzles' | 'games' | 'review' | 'analyze' | 'accuracy' | 'legendary' | 'mistakes' | 'streak' | 'clock' | 'openings'

const ICONS: Record<TileTone, string> = {
  play: 'M6 4l14 8-14 8z',
  puzzles: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  games: 'M4 5h16M4 12h16M4 19h10',
  review: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  // The sidebar's Analyze: a lens over two board squares (FILLS).
  analyze: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6',
  accuracy: 'M3 17l6-6 4 4 8-8',
  legendary: 'M8.5 4.5v10M8.5 19v.5M15.5 4.5v10M15.5 19v.5',
  mistakes: 'M12 9v4M12 16.5v.5M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  streak: 'M12 2c1 3 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-3.8 2.4-5 0 2.2 1 3.4 2.3 3.4 0-3.4-1-6 .3-8.9z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  // An open book.
  openings: 'M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zM12 6.5v14',
}

/** Solid shapes drawn over a tile's strokes. */
const FILLS: Partial<Record<TileTone, string>> = { analyze: 'M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z' }

/** A section's icon on a soft square of its colour, the way Play the computer wears it on Home. */
export function IconTile({ tone, size }: { tone: TileTone; size?: 'small' | 'big' }) {
  return (
    <span className={`icon-tile ${tone} ${size ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d={ICONS[tone]} className={tone === 'streak' ? 'filled' : undefined} />
        {FILLS[tone] && <path d={FILLS[tone]} className="filled" />}
      </svg>
    </span>
  )
}
