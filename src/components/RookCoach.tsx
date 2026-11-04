import { useEffect, useState } from 'react'
import type { RookMood } from '../lib/coach'

// The coach's face: the Rookahead rook, with eyes and a mouth. It shows the moment's face for a beat,
// then settles back to its normal face, and blinks now and then while it waits. Its colours come from
// the theme (the rook in the text colour, its features in the card's), so it suits light and dark.

/** How long a reaction shows before the face settles. */
export const REACT_MS = 1800
const BLINK_MS = 140

const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
const star = (cx: number, cy: number, r: number) => {
  const k = r * 0.2
  return `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
}

const ROOK = 'M20 16Q20 12 24 12H36Q40 12 40 16V22H50V16Q50 12 54 12H66Q70 12 70 16V22H80V16Q80 12 84 12H96Q100 12 100 16V34Q100 38 96 38H90L92 102H100Q106 102 106 108V122Q106 128 100 128H20Q14 128 14 122V108Q14 102 20 102H28L30 38H24Q20 38 20 34Z'
const ARROW = 'M34 89H72V84.5L86 92L72 99.5V95H34Z'

type Part = { d: string; kind: 'fill' | 'line' | 'thin' | 'white' | 'star' | 'drop' }
const fill = (d: string): Part => ({ d, kind: 'fill' })
const line = (d: string): Part => ({ d, kind: 'line' })
const thin = (d: string): Part => ({ d, kind: 'thin' })

const SMILE = line('M53 77Q60 82 67 77')
const FACES: Record<RookMood | 'blink', Part[]> = {
  neutral: [fill(ell(48, 62, 4.5, 6)), fill(ell(72, 62, 4.5, 6)), SMILE],
  blink: [line('M44 63H52'), line('M68 63H76'), SMILE],
  pleased: [line('M42 65Q48 57 54 65'), line('M66 65Q72 57 78 65'), line('M50 75Q60 86 70 75')],
  proud: [
    line('M42 64Q48 56 54 64'),
    line('M66 64Q72 56 78 64'),
    thin('M41 50Q47 46 53 49'),
    thin('M67 49Q73 46 79 50'),
    fill('M49 74Q60 90 71 74Z'),
    { d: star(108, 22, 8), kind: 'star' },
    { d: star(114, 42, 4.5), kind: 'star' },
  ],
  ouch: [line('M42 57L52 62L42 67'), line('M78 57L68 62L78 67'), line('M49 80Q54.5 75 60 80Q65.5 85 71 80'), { d: 'M85 40Q90 47 90 51A5 5 0 0 1 80 51Q80 47 85 40Z', kind: 'drop' }],
  shocked: [
    { d: ell(48, 61, 7.5, 8), kind: 'white' },
    { d: ell(72, 61, 7.5, 8), kind: 'white' },
    fill(ell(48, 62, 3.2, 3.6)),
    fill(ell(72, 62, 3.2, 3.6)),
    thin('M40 47Q47 42 54 46'),
    thin('M66 46Q73 42 80 47'),
    fill(ell(60, 80, 5, 6)),
  ],
  thinking: [fill(ell(51, 62, 4.5, 6)), fill(ell(75, 62, 4.5, 6)), thin('M42 52H54'), thin('M68 51Q74 46 80 49'), line('M57 79H67')],
}

const LABEL: Record<RookMood, string> = {
  neutral: 'The coach',
  pleased: 'The coach, pleased',
  proud: 'The coach, proud',
  ouch: 'The coach, wincing',
  shocked: 'The coach, wide-eyed',
  thinking: 'The coach, thinking',
}

interface Props {
  /** The face for this moment; `neutral` for none. */
  mood: RookMood
  /** Changes with the moment (the move shown), so the same mood twice still reacts again. */
  moodKey: string
}

export function RookCoach({ mood, moodKey }: Props) {
  // The moment that has settled: its reaction is over, and the face is back to normal.
  const [settled, setSettled] = useState<string | null>(null)
  const [blink, setBlink] = useState(false)
  const reacting = mood !== 'neutral' && settled !== moodKey
  useEffect(() => {
    if (mood === 'neutral') return
    const timer = setTimeout(() => setSettled(moodKey), REACT_MS)
    return () => clearTimeout(timer)
  }, [mood, moodKey])
  // A blink every three to five seconds, only while the face is at rest.
  useEffect(() => {
    if (reacting) return
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        setBlink(true)
        timer = window.setTimeout(() => {
          setBlink(false)
          next()
        }, BLINK_MS)
      }, 3000 + Math.random() * 2000)
    }
    next()
    return () => {
      clearTimeout(timer)
      setBlink(false)
    }
  }, [reacting])
  const shown: RookMood = reacting ? mood : 'neutral'
  const parts = FACES[!reacting && blink ? 'blink' : shown]
  return (
    <svg className="rook-coach" viewBox="0 0 120 140" role="img" aria-label={LABEL[shown]}>
      {/* A small lift as a reaction comes in; keyed, so each new moment plays it again. */}
      <g key={reacting ? moodKey : 'rest'} className={reacting ? 'rook-react' : undefined}>
        <path className="rook-body" d={ROOK} />
        <path className="rook-carve" d={ARROW} />
        {parts.map((p, i) => (
          <path key={i} className={`rook-${p.kind}`} d={p.d} />
        ))}
      </g>
    </svg>
  )
}
