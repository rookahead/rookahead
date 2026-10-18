import { CLASS_INFO } from '../lib/classify'

/** A puzzle move's verdict: ✓ in the Precise green or ✗ in the Blunder red, on a rounded square like the verdict badges. */
export function PuzzleMark({ kind, size = 18 }: { kind: 'correct' | 'wrong'; size?: number }) {
  return (
    <svg className="class-icon puzzle-mark" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={kind === 'correct' ? 'Right move' : 'Wrong move'}>
      <rect x="4" y="4" width="92" height="92" rx="28" fill={kind === 'correct' ? CLASS_INFO.best.color : CLASS_INFO.blunder.color} />
      <path
        d={kind === 'correct' ? 'M29 52l14 14 28-31' : 'M34 34l32 32M66 34 34 66'}
        fill="none"
        stroke="#fff"
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The streak flame. */
export function Flame({ size = 18, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <svg className={`flame ${lit ? 'lit' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5c.6 3.3-1.2 5.2-2.8 7C7.6 11.2 6 13 6 15.6A6 6 0 0 0 12 21.5a6 6 0 0 0 6-5.9c0-2.9-1.5-5-2.6-6.3-.3 1.6-1 2.8-2.2 3.4.4-3.7-.2-7.6-1.2-10.2z" />
      <path className="flame-core" d="M12 21.5a3 3 0 0 1-3-3c0-1.8 1.4-2.9 2.2-4 .3 1.1 1 1.7 1.8 2 .2-.9.6-1.4 1.1-1.9.6.9.9 1.9.9 3.1a3 3 0 0 1-3 3.8z" />
    </svg>
  )
}
