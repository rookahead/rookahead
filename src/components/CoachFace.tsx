import { useEffect, useRef, useState } from 'react'

// The coach's face on its own: the rook's head (its battlements and its face, no body), with eyes that do the
// talking. They look toward the pointer, glance about when it's still, blink (now and then twice), squint for a
// moment, and turn happy (^^) for good news or while you point at it. The head bobs gently and leans the way
// it looks. With reduced motion it keeps still and only shows its mood.

const HEAD =
  'M20 16Q20 12 24 12H36Q40 12 40 16V22H50V16Q50 12 54 12H66Q70 12 70 16V22H80V16Q80 12 84 12H96Q100 12 100 16V34Q100 38 96 38H92V82Q92 94 80 94H40Q28 94 28 82V38H24Q20 38 20 34Z'
/** Where the eyes sit, and how far they travel toward what they look at (the drawing's units). */
const EYES = [48, 72]
const EYE_Y = 62
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
  const [hover, setHover] = useState(false)
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

  // Blinks every few seconds (sometimes twice), and once in a while a short squint.
  useEffect(() => {
    if (still) return
    let timer = 0
    const after = (ms: number, then: () => void) => {
      timer = window.setTimeout(then, ms)
    }
    const next = () =>
      after(rand(2200, 4800), () => {
        const squint = Math.random() < 0.15
        setLids(squint ? 'squint' : 'blink')
        after(squint ? 700 : 120, () => {
          setLids('open')
          if (!squint && Math.random() < 0.25)
            after(140, () => {
              setLids('blink')
              after(110, () => {
                setLids('open')
                next()
              })
            })
          else next()
        })
      })
    next()
    return () => clearTimeout(timer)
  }, [still])

  const glad = cheer || hover
  const at = still ? { x: 0, y: 0 } : look
  const shift = { translate: `${(at.x * TRAVEL_X).toFixed(2)}px ${(at.y * TRAVEL_Y).toFixed(2)}px` }
  const lid = lids === 'blink' ? 0.1 : lids === 'squint' ? 0.45 : 1
  return (
    <svg
      ref={svg}
      className={`coach-face ${still ? '' : 'moving'}`}
      viewBox="16 6 88 92"
      role="img"
      aria-label={glad ? 'The coach, smiling' : 'The coach'}
      style={{ rotate: `${(at.x * LEAN_DEG).toFixed(2)}deg` }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <path className="coach-face-head" d={HEAD} />
      <g className="coach-face-eyes" style={shift}>
        {glad
          ? EYES.map((x) => <path key={x} className="coach-face-happy" d={`M${x - 7} ${EYE_Y + 3}Q${x} ${EYE_Y - 8} ${x + 7} ${EYE_Y + 3}`} />)
          : EYES.map((x) => <ellipse key={x} className="coach-face-eye" cx={x} cy={EYE_Y} rx={6} ry={8.5} style={{ scale: `1 ${lid}` }} />)}
      </g>
    </svg>
  )
}
