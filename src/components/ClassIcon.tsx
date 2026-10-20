import { CLASS_INFO, type MoveClass } from '../lib/classify'

// Every mark is drawn, not typed, so it looks the same everywhere: in the app, and in share
// images and GIFs, where an SVG drawn to a canvas can't use the page's fonts.

const line = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const solid = (width: number) => ({ fill: '#fff', stroke: '#fff', strokeWidth: width, strokeLinejoin: 'round' }) as const

/** "!" with its bar centred on x = cx, scaled by s. */
function Bang({ cx, s = 1 }: { cx: number; s?: number }) {
  return (
    <>
      <path d={`M${cx} ${50 - 25 * s}V${50 + 6 * s}`} {...line} strokeWidth={12.5 * s} />
      <circle cx={cx} cy={50 + 24 * s} r={7.2 * s} fill="#fff" />
    </>
  )
}

/** "?" centred on x = cx, scaled by s. */
function Query({ cx, s = 1 }: { cx: number; s?: number }) {
  const p = (x: number, y: number) => `${+(cx + (x - 50) * s).toFixed(2)} ${+(50 + (y - 50) * s).toFixed(2)}`
  const d = `M${p(36.5, 38)}C${p(36.5, 29.5)} ${p(42.5, 24.5)} ${p(50.5, 24.5)}C${p(58.5, 24.5)} ${p(64, 29.5)} ${p(64, 36.5)}C${p(64, 43)} ${p(59.5, 46)} ${p(55.5, 48.5)}C${p(52, 50.8)} ${p(50.5, 53.5)} ${p(50.5, 58)}`
  return (
    <>
      <path d={d} {...line} strokeWidth={11 * s} />
      <circle cx={cx + 0.5 * s} cy={50 + 24.5 * s} r={7 * s} fill="#fff" />
    </>
  )
}

/** Rookahead's own drawings of the familiar marks. `small`: too small for fine detail. */
function Mark({ cls, small }: { cls: MoveClass; small: boolean }) {
  switch (cls) {
    case 'brilliant': // !!, with a spark when there's room for it
      return small ? (
        <>
          <Bang cx={38} s={0.94} />
          <Bang cx={62} s={0.94} />
        </>
      ) : (
        <>
          <Bang cx={36} s={0.88} />
          <Bang cx={57} s={0.88} />
          <path d="M77 14Q78.6 22.4 87 24Q78.6 25.6 77 34Q75.4 25.6 67 24Q75.4 22.4 77 14Z" fill="#fff" />
        </>
      )
    case 'great':
      return <Bang cx={50} />
    case 'best': // star
      return <path d="M50 23l8.2 16.8 18.5 2.7-13.4 13 3.2 18.4L50 65.2l-16.5 8.7 3.2-18.4-13.4-13 18.5-2.7z" {...solid(4)} />
    case 'excellent': // thumbs-up
      return <path d="M28 50h9v24h-9zM43 50l9-19c2.5-5 9.5-3.5 9 2l-1.5 12H71c4 0 7 3.6 6 7.6l-3.6 14.6A6 6 0 0 1 67.6 72H43z" {...solid(3)} />
    case 'good': // check
      return <path d="M29 52l14 14 28-30" {...line} strokeWidth={11} />
    case 'book': // an open book
      return <path d="M50 33C43 28 32 27 24 30V70C32 67 43 68 50 73C57 68 68 67 76 70V30C68 27 57 28 50 33ZM50 33V73" {...line} strokeWidth={7.5} />
    case 'inaccuracy':
      return (
        <>
          <Query cx={37} s={0.8} />
          <Bang cx={66} s={0.8} />
        </>
      )
    case 'mistake':
      return <Query cx={50} />
    case 'miss': // a crossed-out eye: the chance you didn't see
      return (
        <>
          <path d="M21 50C31 34 69 34 79 50C69 66 31 66 21 50Z" {...line} strokeWidth={8.5} />
          <circle cx="50" cy="50" r="8" fill="#fff" />
          <path d="M27 77L73 23" stroke={CLASS_INFO.miss.color} strokeWidth={20} strokeLinecap="round" />
          <path d="M27 77L73 23" {...line} strokeWidth={9} />
        </>
      )
    case 'blunder':
      return (
        <>
          <Query cx={33} s={0.8} />
          <Query cx={66} s={0.8} />
        </>
      )
    case 'forced':
      return <path d="M29 50H69M55 35L70 50 55 65" {...line} strokeWidth={10.5} />
  }
}

/** A move's verdict badge: a rounded square in the verdict's colour. */
export function ClassIcon({ cls, size = 18, title }: { cls: MoveClass; size?: number; title?: string }) {
  const info = CLASS_INFO[cls]
  return (
    <svg className="class-icon" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? info.label}>
      <rect x="4" y="4" width="92" height="92" rx="28" fill={info.color} />
      <Mark cls={cls} small={size < 24} />
    </svg>
  )
}
