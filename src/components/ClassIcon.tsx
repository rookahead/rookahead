import { CLASS_INFO, type MoveClass } from '../lib/classify'

/** Chess notation where it exists (nobody owns !! or ??). */
const TEXT_GLYPH: Partial<Record<MoveClass, { text: string; size: number }>> = {
  brilliant: { text: '!!', size: 50 },
  great: { text: '!', size: 62 },
  inaccuracy: { text: '?!', size: 46 },
  mistake: { text: '?', size: 60 },
  blunder: { text: '??', size: 46 },
}

const stroke = { fill: 'none', stroke: '#fff', strokeWidth: 9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const solid = (width: number) => ({ fill: '#fff', stroke: '#fff', strokeWidth: width, strokeLinejoin: 'round' }) as const

/** Rookahead's own drawings of the familiar marks. */
function Mark({ cls }: { cls: MoveClass }) {
  switch (cls) {
    case 'best': // star
      return <path d="M50 24l8 16.6 18.2 2.6-13.2 12.9 3.1 18.1L50 65.6l-16.3 8.6 3.1-18.1-13.2-12.9 18.2-2.6z" {...solid(4)} />
    case 'excellent': // thumbs-up
      return <path d="M28 50h9v24h-9zM43 50l9-19c2.5-5 9.5-3.5 9 2l-1.5 12H71c4 0 7 3.6 6 7.6l-3.6 14.6A6 6 0 0 1 67.6 72H43z" {...solid(3)} />
    case 'good': // check
      return <path d="M30 52l13 13 27-29" {...stroke} />
    case 'book': // an opening tree
      return <path d="M50 76V55M50 55 33 37M50 55 67 37M33 24a6 6 0 1 0 .01 0zM67 24a6 6 0 1 0 .01 0z" {...stroke} />
    case 'miss': // a ring: the chance that went by
      return <path d="M50 30a20 20 0 1 0 .01 0z" {...stroke} />
    case 'forced':
      return <path d="M30 50h36M54 36l14 14-14 14" {...stroke} />
    default:
      return null
  }
}

/** A move's verdict badge: a rounded square in the verdict's colour. */
export function ClassIcon({ cls, size = 18, title }: { cls: MoveClass; size?: number; title?: string }) {
  const info = CLASS_INFO[cls]
  const glyph = TEXT_GLYPH[cls]
  return (
    <svg className="class-icon" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? info.label}>
      <rect x="4" y="4" width="92" height="92" rx="28" fill={info.color} />
      {glyph ? (
        <text x="50" y="53" textAnchor="middle" dominantBaseline="central" fontSize={glyph.size} fontWeight="800" fill="#fff" letterSpacing="-3">
          {glyph.text}
        </text>
      ) : (
        <Mark cls={cls} />
      )}
    </svg>
  )
}
