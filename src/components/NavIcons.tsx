const PATHS = {
  first: <path d="M6 5h2v14H6zM20 5v14l-10-7z" />,
  prev: <path d="M15.4 5.4 9 12l6.4 6.6-1.4 1.4L6.2 12 14 4z" />,
  next: <path d="m8.6 18.6 6.4-6.6-6.4-6.6L10 4l7.8 8-7.8 8z" />,
  last: <path d="M16 5h2v14h-2zM4 5v14l10-7z" />,
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  pause: <path d="M6.5 5h4v14h-4zm7 0h4v14h-4z" />,
  back: <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />,
}

/** A move-control icon (24×24), shared by Analysis and Play. */
export function NavIcon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}

/** Flip board: a rounded square turning round, the same everywhere (move controls, headers, menus). Drawn in strokes. */
export function FlipIcon() {
  return (
    <svg className="flip-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 15V8a4 4 0 0 1 4-4h9M14.5 1.75 17 4l-2.5 2.25M20 9v7a4 4 0 0 1-4 4H7M9.5 17.75 7 20l2.5 2.25" />
    </svg>
  )
}
