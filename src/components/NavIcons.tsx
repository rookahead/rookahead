const PATHS = {
  first: <path d="M6 5h2v14H6zM20 5v14l-10-7z" />,
  prev: <path d="M15.4 5.4 9 12l6.4 6.6-1.4 1.4L6.2 12 14 4z" />,
  next: <path d="m8.6 18.6 6.4-6.6-6.4-6.6L10 4l7.8 8-7.8 8z" />,
  last: <path d="M16 5h2v14h-2zM4 5v14l10-7z" />,
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  pause: <path d="M6.5 5h4v14h-4zm7 0h4v14h-4z" />,
  flip: <path d="M7 3 3 7l4 4V8h11V6H7zm10 10v3H6v2h11v3l4-4z" />,
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
