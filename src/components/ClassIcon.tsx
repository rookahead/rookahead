import { CLASS_INFO, type MoveClass } from '../lib/classify'

const TEXT_GLYPH: Partial<Record<MoveClass, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

function Glyph({ cls }: { cls: MoveClass }) {
  const text = TEXT_GLYPH[cls]
  if (text) {
    return (
      <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize={text.length > 1 ? 50 : 60} fontWeight="800" fill="#fff" letterSpacing="-4">
        {text}
      </text>
    )
  }
  const stroke = { fill: 'none', stroke: '#fff', strokeWidth: 10, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  switch (cls) {
    case 'best':
      return <path d="M50 18l9.4 19.6 21.6 2.6-15.9 14.8 4.1 21.4L50 66 30.8 76.4l4.1-21.4L19 40.2l21.6-2.6z" fill="#fff" />
    case 'excellent':
      return (
        <g fill="#fff">
          <rect x="22" y="46" width="13" height="30" rx="3" />
          <path d="M40 46l11-19c2.5-4.5 9-3 9 2.5L58 42h14c5 0 8.5 4.5 7.3 9.3l-4.6 18.5A8 8 0 0 1 67 76H40z" />
        </g>
      )
    case 'good':
      return <path d="M28 52l15 15 30-32" {...stroke} />
    case 'book':
      return (
        <g fill="#fff">
          <path d="M22 31c9-3 18-2 25 4v38c-7-5-16-6-25-3z" />
          <path d="M78 31c-9-3-18-2-25 4v38c7-5 16-6 25-3z" />
        </g>
      )
    case 'miss':
      return <path d="M34 34l32 32M66 34L34 66" {...stroke} />
    case 'forced':
      return <path d="M28 50h40M54 36l14 14-14 14" {...stroke} />
    default:
      return null
  }
}

/** Round classification badge, e.g. the green star for "best". */
export function ClassIcon({ cls, size = 18, title }: { cls: MoveClass; size?: number; title?: string }) {
  const info = CLASS_INFO[cls]
  return (
    <svg className="class-icon" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? info.label}>
      <circle cx="50" cy="50" r="48" fill={info.color} />
      <Glyph cls={cls} />
    </svg>
  )
}
