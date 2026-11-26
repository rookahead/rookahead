import { useId, type CSSProperties } from 'react'
import WORDMARK from '../wordmark.json'

/**
 * "ROOKAHEAD": ROOK upright, its O's two eyes, and AHEAD leaning out of it, the A pushed into the K (cut along
 * the A's edge). Drawn (Russo One's outlines, OFL, src/wordmark.json) rather than set as text, so it sits the same
 * in every browser: the box is the capitals, centred on the tile.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  // (useId's colons don't belong in a url(#…).)
  const clip = `wm-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg className={`wordmark ${className}`} viewBox={WORDMARK.viewBox} role="img" aria-label="Rookahead">
      <clipPath id={clip}>
        <path d={WORDMARK.clip} />
      </clipPath>
      <path d={WORDMARK.rook} clipPath={`url(#${clip})`} />
      <path className="wordmark-tail" d={WORDMARK.ahead} />
    </svg>
  )
}

/** The wordmark a letter at a time, for the sign-in page, where the letters fly in: each its own drawing, stacked. */
export function WordmarkLetters() {
  const clip = `wml-${useId().replace(/[^\w-]/g, '')}`
  return (
    <>
      {WORDMARK.letters.map((l, i) => (
        <i key={i} className={l.w === 'a' ? 'wordmark-tail' : undefined} style={{ '--i': l.w === 'r' ? 3 - i : i - 4 } as CSSProperties}>
          <svg viewBox={WORDMARK.viewBox} aria-hidden>
            {i === 3 && (
              <clipPath id={clip}>
                <path d={WORDMARK.clip} />
              </clipPath>
            )}
            <path d={l.d} clipPath={i === 3 ? `url(#${clip})` : undefined} />
          </svg>
        </i>
      ))}
    </>
  )
}

/** An O's outline without its hole: the white of an eye. */
const outline = (d: string) => d.slice(0, d.indexOf('M', 1))

/** Each O's eye: the coach's oval (7 wide to 9 tall), towards the O's right side, looking ahead (at AHEAD). */
const EYES = [1155, 1895]

/**
 * The name in two lines for the sidebar, beside the logo: ROOK over AHEAD, AHEAD set a little to the right. ROOK's
 * R and K are dimmed and its O's are solid, each with the coach's oval eye in it, looking right (ahead).
 */
export function StackedWordmark({ className = '' }: { className?: string }) {
  const [r, o1, o2, k] = WORDMARK.letters
  return (
    <span className={`wordmark-stack ${className}`} role="img" aria-label="Rookahead">
      <svg className="wm-rook" viewBox="60 0 2826 700" aria-hidden>
        <path className="wm-dim" d={r.d} />
        {[o1, o2].map((o, i) => (
          <g key={i}>
            <path className="wm-eye" d={outline(o.d)} />
            <ellipse className="wm-pupil" cx={EYES[i]} cy="350" rx="156" ry="200.6" />
          </g>
        ))}
        <path className="wm-dim" d={k.d} />
      </svg>
      <svg className="wm-ahead" viewBox="2776 0 3664 700" aria-hidden>
        <path d={WORDMARK.ahead} />
      </svg>
    </span>
  )
}
