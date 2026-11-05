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

/** Share: three joined dots, the sign everyone knows (not an arrow, which reads like Load's). */
export function ShareIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1" />
    </svg>
  )
}

/** New board: a board with a plus. */
export function NewBoardIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="2.5" width="14" height="14" rx="2" />
      <path d="M2.5 9.5h14M9.5 2.5v14M19.5 15v7M16 18.5h7" />
    </svg>
  )
}

/** Load a game: an open folder. */
export function LoadIcon() {
  return (
    <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 18V6.5a2 2 0 0 1 2-2h3.8l2 2h6.2a2 2 0 0 1 2 2V10" />
      <path d="M3.5 18l2.4-6.2A2.5 2.5 0 0 1 8.2 10.2h12.3a1 1 0 0 1 .95 1.3l-2 6.3a2.5 2.5 0 0 1-2.4 1.7H4.5a1 1 0 0 1-1-1.5z" />
    </svg>
  )
}
