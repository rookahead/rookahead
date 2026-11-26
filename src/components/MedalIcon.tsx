import { MEDALS, type Medal, type MedalTier } from '../lib/medals'

interface Colours {
  coin: string
  /** The disc in the middle, a shade lighter, that the picture sits on. */
  inner: string
  ribbon: string
  icon: string
}

/** Each rarity's colours: the board's blues, then gold, then graphite. */
const TIER: Record<MedalTier, Colours> = {
  common: { coin: '#a5b9e8', inner: '#b7c7ee', ribbon: '#8ea6df', icon: '#1f3f8f' },
  uncommon: { coin: '#3c6bd7', inner: '#4b78e0', ribbon: '#2f59bd', icon: '#ffffff' },
  rare: { coin: '#f0c14b', inner: '#f5cf6a', ribbon: '#d9a933', icon: '#4a3405' },
  unique: { coin: '#3a3a44', inner: '#4a4a55', ribbon: '#2a2a32', icon: '#f0c14b' },
}

/** Medals that aren't about rarity keep their own colours: checkmate is how a game ended, won or lost
 *  (a graphite light enough to hold its size on a dark row). */
const OWN: Partial<Record<Medal, Colours>> = { checkmate: { coin: '#5c5c68', inner: '#6a6a77', ribbon: '#4a4a55', icon: '#ffffff' } }

/** The pieces' king (24 grid). */
const KING = 'M11 2.2h2v1.9h1.9v1.9H13v1.8h-2V6H9.1V4.1H11zM7.2 9.6C8.8 8.7 10.3 8.4 12 8.4S15.2 8.7 16.8 9.6C17.7 13 16.3 15.8 14.6 17.4H9.4C7.7 15.8 6.3 13 7.2 9.6ZM6 18.3H18V20.9H6Z'

/** How much of the coin each picture fills. */
const FILL: Record<Medal, number> = { repetition: 0.66, backToBack: 0.66, legendary: 0.74, checkmate: 0.74 }

/** The medals' pictures, bold and filled so they hold at a row's size: on a 100 grid, in the icon's colour. */
function Picture({ medal, coin }: { medal: Medal; coin: string }) {
  switch (medal) {
    case 'repetition': // two arrows chasing each other round
      return (
        <>
          <path d="M50 18A32 32 0 0 1 81 42M50 82A32 32 0 0 1 19 58" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
          <path d="M90 36L82 56L66 42ZM10 64L18 44L34 58Z" fill="currentColor" />
        </>
      )
    case 'legendary': // !!, bold
      return (
        <>
          <rect x="31" y="22" width="14" height="40" rx="7" fill="currentColor" />
          <rect x="55" y="22" width="14" height="40" rx="7" fill="currentColor" />
          <circle cx="38" cy="76" r="8" fill="currentColor" />
          <circle cx="62" cy="76" r="8" fill="currentColor" />
        </>
      )
    case 'checkmate': // the king tipped over
      return (
        <g transform="translate(45.64 12.16) scale(3.485)">
          <path d={KING} transform="rotate(-58 6 20.9)" fill="currentColor" />
        </g>
      )
    case 'backToBack': // a Legendary badge on another
      return (
        <>
          <rect x="12" y="12" width="52" height="52" rx="9" fill="currentColor" opacity="0.45" />
          <rect x="34" y="34" width="54" height="54" rx="9" fill="currentColor" />
          <rect x="48" y="44" width="9" height="24" rx="4.5" fill={coin} />
          <rect x="65" y="44" width="9" height="24" rx="4.5" fill={coin} />
          <circle cx="52.5" cy="77" r="5" fill={coin} />
          <circle cx="69.5" cy="77" r="5" fill={coin} />
        </>
      )
  }
}

/**
 * A medal in its rarity's colour. As a coin (a game's row): a plain disc with its picture in the middle, the same size
 * for every medal. As a medal (stacked): the coin on two ribbon tails, its picture on a lighter disc, edged in
 * --medal-edge (the background behind it) so medals stacked one over another stay apart.
 */
export function MedalIcon({ medal, size = 18, ribbon = false }: { medal: Medal; size?: number; ribbon?: boolean }) {
  const c = OWN[medal] ?? TIER[MEDALS[medal].tier]
  if (!ribbon)
    return (
      <svg className="medal-icon" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={MEDALS[medal].label} style={{ color: c.icon }}>
        <title>{MEDALS[medal].label}</title>
        <circle cx="50" cy="50" r="50" fill={c.coin} />
        <g transform={`translate(50 50) scale(${FILL[medal]}) translate(-50 -50)`}>
          <Picture medal={medal} coin={c.coin} />
        </g>
      </svg>
    )
  return (
    <svg className="medal-icon" width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-label={MEDALS[medal].label} style={{ color: c.icon }}>
      <title>{MEDALS[medal].label}</title>
      <path d="M28 72L28 116L50 102L72 116L72 72Z" fill={c.ribbon} stroke="var(--medal-edge)" strokeWidth="7" strokeLinejoin="round" />
      <circle cx="50" cy="48" r="46" fill={c.coin} stroke="var(--medal-edge)" strokeWidth="7" />
      <circle cx="50" cy="48" r="35" fill={c.inner} />
      <g transform={`translate(50 48) scale(${FILL[medal] * 0.85}) translate(-50 -50)`}>
        <Picture medal={medal} coin={c.inner} />
      </g>
    </svg>
  )
}

/** A game's medals overlapping, the rarest in front, three at most and how many more; their names on hover. */
export function MedalStack({ medals, size = 18 }: { medals: Medal[]; size?: number }) {
  const shown = medals.slice(0, 3)
  return (
    <span className="medal-stack" title={medals.map((m) => MEDALS[m].label).join(' · ')}>
      {shown.map((m, i) => (
        <span key={m} className="medal-stack-item" style={{ zIndex: shown.length - i, marginLeft: i ? -size * 0.36 : 0 }}>
          <MedalIcon medal={m} size={size} ribbon />
        </span>
      ))}
      {medals.length > 3 && <span className="medal-stack-more">+{medals.length - 3}</span>}
    </span>
  )
}
