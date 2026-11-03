// Drawn in lines (index.css, .line-icon), like the page's other actions; Play stays solid, as media controls are.
const PATHS = {
  first: <path d="M7 6v12m10-12-6 6 6 6" />,
  prev: <path d="m15 6-6 6 6 6" />,
  next: <path d="m9 6 6 6-6 6" />,
  last: <path d="M17 6v12M7 6l6 6-6 6" />,
  play: <path className="solid" d="M8.5 6.5v11l8.5-5.5z" />,
  pause: <path d="M9 6v12m6-12v12" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
}

/** A move-control icon (24×24), shared by Analysis and Play. */
export function NavIcon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}

/** Flip board: a rounded square turning round, the same everywhere (move controls, headers, menus). */
export function FlipIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 14.5v-6A3.5 3.5 0 0 1 8.5 5H16m-2-2 2 2-2 2m5 2.5v6a3.5 3.5 0 0 1-3.5 3.5H8m2-2-2 2 2 2" />
    </svg>
  )
}

/** Sounds on or off: the speaker, crossed out when muted. */
export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d={muted ? 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5' : 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'} />
    </svg>
  )
}

export function ShareIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6" />
    </svg>
  )
}

export function NewBoardIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}

export function LoadIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  )
}
