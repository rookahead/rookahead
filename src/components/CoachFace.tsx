import { useEffect, useRef, useState } from 'react'
import { COACH_BLINK_MS, blinkGap, COACH_EYE_Y, COACH_EYES, COACH_HEAD } from './RookCoach'

// The coach's face on its own: the rook's head (its battlements and its face, no body), with eyes that do the
// talking. They look toward the pointer, glance about when it's still, blink as the Coach tile's do (oval, dot, dash,
// at the same pace), squint for a moment now and then, and turn happy (^^) for good news. Pointing at it changes nothing. The head bobs gently and leans the way
// it looks. With reduced motion it keeps still and only shows its mood.

/** Where the eyes sit, and how far they travel toward what they look at (the drawing's units). */
const EYES = COACH_EYES
const EYE_Y = COACH_EYE_Y
const TRAVEL_X = 7
const TRAVEL_Y = 5
const LEAN_DEG = 6
/** How long a happy face lasts after good news. */
const HAPPY_MS = 2200

type Look = { x: number; y: number }
type Lids = 'open' | 'blink' | 'squint'

const rand = (min: number, max: number) => min + Math.random() * (max - min)

interface Props {
  /** Good news: the face goes happy for a moment (and again whenever `moodKey` changes). */
  happy: boolean
  moodKey: string
}

export function CoachFace({ happy, moodKey }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [look, setLook] = useState<Look>({ x: 0, y: 0 })
  const [lids, setLids] = useState<Lids>('open')
  const [cheer, setCheer] = useState(false)
  // When the pointer last moved: idle glances only start once it has been still for a while.
  const moved = useRef(0)
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // Good news: happy eyes for a moment.
  useEffect(() => {
    if (!happy) return
    setCheer(true)
    const timer = setTimeout(() => setCheer(false), HAPPY_MS)
    return () => clearTimeout(timer)
  }, [happy, moodKey])

  // The eyes follow the pointer.
  useEffect(() => {
    if (still || !matchMedia('(hover: hover)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      moved.current = performance.now()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = svg.current?.getBoundingClientRect()
        if (!box) return
        const dx = e.clientX - (box.left + box.width / 2)
        const dy = e.clientY - (box.top + box.height / 2)
        // Full turn once the pointer is a few hundred pixels away; closer, a little less.
        const reach = Math.min(1, Math.hypot(dx, dy) / 280)
        const angle = Math.atan2(dy, dx)
        setLook({ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach })
      })
    }
    window.addEventListener('pointermove', move)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
    }
  }, [still])

  // Left alone, it glances about, and now and then looks straight back at you.
  useEffect(() => {
    if (still) return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(
        () => {
          if (performance.now() - moved.current > 2500) setLook(Math.random() < 0.35 ? { x: 0, y: 0 } : { x: rand(-1, 1), y: rand(-0.8, 0.6) })
          next()
        },
        rand(1400, 3400),
      )
    }
    next()
    return () => clearTimeout(timer)
  }, [still])

  // Blinks every few seconds, like the Coach tile's coach, and once in a while a short squint.
  useEffect(() => {
    if (still) return
    let timer = 0
    const after = (ms: number, then: () => void) => {
      timer = window.setTimeout(then, ms)
    }
    const next = () =>
      after(blinkGap(), () => {
        const squint = Math.random() < 0.1
        setLids(squint ? 'squint' : 'blink')
        after(squint ? 700 : COACH_BLINK_MS, () => {
          setLids('open')
          next()
        })
      })
    next()
    return () => clearTimeout(timer)
  }, [still])

  const glad = cheer
  const at = still ? { x: 0, y: 0 } : look
  const shift = { translate: `${(at.x * TRAVEL_X).toFixed(2)}px ${(at.y * TRAVEL_Y).toFixed(2)}px` }
  const lid = lids === 'squint' ? 0.45 : 1
  return (
    <svg
      ref={svg}
      className={`coach-face ${still ? '' : 'moving'}`}
      viewBox="16 6 88 92"
      role="img"
      aria-label={glad ? 'The coach, smiling' : 'The coach'}
      style={{ rotate: `${(at.x * LEAN_DEG).toFixed(2)}deg` }}
    >
      <path className="coach-face-head" d={COACH_HEAD} />
      <g className={`coach-face-eyes coach-eyes ${lids === 'blink' ? 'blink' : ''}`} style={shift}>
        {glad
          ? EYES.map((x) => <path key={x} className="coach-face-happy" d={`M${x - 7} ${EYE_Y + 3}Q${x} ${EYE_Y - 8} ${x + 7} ${EYE_Y + 3}`} />)
          : EYES.map((x) => (
              <g key={x}>
                <ellipse className="coach-face-eye open" cx={x} cy={EYE_Y} rx={6} ry={8.5} style={lid < 1 ? { scale: `1 ${lid}` } : undefined} />
                <path className="shut" d={`M${x - 7} ${EYE_Y + 2}H${x + 7}`} />
              </g>
            ))}
      </g>
    </svg>
  )
}
