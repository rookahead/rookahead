// Chess clocks as plain data: each side's time left (ms), and which one is running since when.
import type { Color } from './evaluation'

/** Base seconds + increment seconds, as the PGN TimeControl tag writes it. */
export const CLOCK_GROUPS = [
  { name: 'Bullet', settings: ['60+0', '120+1'] },
  { name: 'Blitz', settings: ['180+0', '180+2', '300+0', '300+3'] },
  { name: 'Rapid', settings: ['600+0', '600+5', '900+10'] },
  { name: 'Classical', settings: ['1800+0', '1800+20'] },
] as const

export type ClockSetting = 'none' | (typeof CLOCK_GROUPS)[number]['settings'][number]

const SETTINGS: readonly string[] = ['none', ...CLOCK_GROUPS.flatMap((g) => g.settings)]

export function isClockSetting(value: unknown): value is ClockSetting {
  return typeof value === 'string' && SETTINGS.includes(value)
}

/** "10+5": minutes + increment seconds. */
export function clockLabel(setting: ClockSetting): string {
  if (setting === 'none') return 'Untimed'
  const [base, inc] = setting.split('+').map(Number)
  return `${base / 60}+${inc}`
}

export interface ClockState {
  white: number
  black: number
  running: Color
  /** When the running side's time started counting; null while paused. */
  since: number | null
  increment: number
}

export function startClock(setting: ClockSetting, now: number, first: Color): ClockState | null {
  if (setting === 'none') return null
  const [base, inc] = setting.split('+').map(Number)
  return { white: base * 1000, black: base * 1000, running: first, since: now, increment: inc * 1000 }
}

export function remaining(c: ClockState, color: Color, now: number): number {
  return c[color] - (c.running === color && c.since !== null ? Math.max(0, now - c.since) : 0)
}

/** The mover finished their move: their time stops (plus the increment) and the other side's starts. */
export function press(c: ClockState, mover: Color, now: number): ClockState {
  const other: Color = mover === 'white' ? 'black' : 'white'
  return { ...c, [mover]: remaining(c, mover, now) + c.increment, running: other, since: now }
}

export function pause(c: ClockState, now: number): ClockState {
  return { ...c, [c.running]: remaining(c, c.running, now), since: null }
}

export function resume(c: ClockState, now: number): ClockState {
  return c.since === null ? { ...c, since: now } : c
}

export function flagged(c: ClockState, now: number): Color | null {
  return remaining(c, c.running, now) <= 0 ? c.running : null
}
