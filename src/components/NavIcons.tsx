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
