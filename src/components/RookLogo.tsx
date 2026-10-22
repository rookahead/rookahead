const ROOK = 'M5 3H8V5H10.5V3H13.5V5H16V3H19V7.72L15 6.3V7.3H10.5A0.7 0.7 0 0 0 10.5 8.7H15V9.7L19 8.28V11H15.5C15.5 15 16.5 17 19.5 18V21H4.5V18C7.5 17 8.5 15 8.5 11H5Z'

/** The Rookahead mark: a rook with an arrow cut through it, breaking out to the right. */
export function RookLogo() {
  return (
    <span className="brand-logo" aria-hidden>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d={ROOK} />
      </svg>
    </span>
  )
}

/** The browser tab's icon in your colour, as public/favicon.svg draws it in Gold: the rook on a rounded tile. */
export function faviconUrl(tile: string, rook: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${tile}"/><path transform="translate(4 4)" fill="${rook}" d="${ROOK}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
