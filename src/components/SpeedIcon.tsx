import { SPEED_LABEL, type Speed } from '../lib/speed'

/** Drawn on a 24 grid, filled; untimed is a line. */
export const SPEED_ICON: Record<Speed, string> = {
  // A bullet flying right, with two speed lines behind it.
  bullet: 'M9.5 7.5H15C18.4 7.5 21.2 9.4 22.5 12C21.2 14.6 18.4 16.5 15 16.5H9.5ZM6.5 7.5H8.3V16.5H6.5ZM1.5 9.2H5.3V10.9H1.5ZM2.8 13.1H5.3V14.8H2.8Z',
  // A lightning bolt.
  blitz: 'M14.2 1.8L4.8 13.6H10.8L9.4 22.2L19.2 9.8H13.1Z',
  // A rabbit sitting up, ears back.
  rapid:
    'M13.2 21.5H5.6C3.8 21.5 2.6 20 3 18.2C3.6 15 6.4 12.6 9.8 12.4C10.9 12.3 11.9 12.5 12.8 12.9C13.4 12.1 14.2 11.5 15.1 11.2C14.1 9.5 13.3 7.3 13.2 5C13.1 3.4 14.6 2.9 15.4 4.2C16.2 5.5 16.8 7.4 17 9.2C17.3 7.6 17.9 6 18.7 4.9C19.6 3.7 21 4.3 20.8 5.8C20.6 7.9 19.8 9.8 18.6 11.3C20 12 21 13.4 21 15C21 16.6 19.9 17.8 18.4 17.9L16.9 18C16.4 19 16.4 19.8 17 20.3C17.4 20.7 17.2 21.5 16.5 21.5ZM4.4 15.3A1.7 1.7 0 1 1 1.3 14.6A1.7 1.7 0 0 1 4.4 15.3Z',
  // A turtle: shell, head out front, two feet.
  classical:
    'M2.5 15.5C2.5 10.8 6.3 7.5 11 7.5C15.7 7.5 19.5 10.8 19.5 15.5ZM18.6 12.2C19.2 11.4 20.1 11 21 11C22.4 11 23.3 12 23.3 13.2C23.3 14.5 22.3 15.5 21 15.5H20.1C20 14.3 19.5 13.2 18.6 12.2ZM2 16.6H20V18.2H2ZM4.5 18.2H8V20.5H4.5ZM14 18.2H17.5V20.5H14ZM2 16.6L0.6 17.8L2 18.2Z',
  // A paper plane.
  daily: 'M1.8 10.8L22.2 2.8L10.4 13.4ZM11.6 14.4L22.2 2.8L16.4 21.2ZM10.2 15V20.4L12.9 17.4Z',
  // Infinity: no clock.
  untimed: 'M12 12C10.4 9.6 9 8.2 7 8.2A3.8 3.8 0 0 0 7 15.8C9 15.8 10.4 14.4 12 12C13.6 9.6 15 8.2 17 8.2A3.8 3.8 0 0 1 17 15.8C15 15.8 13.6 14.4 12 12Z',
}

/** A game's speed as a small icon: a bullet, a bolt, a rabbit, a turtle, a paper plane, or infinity. */
export function SpeedIcon({ speed, time }: { speed: Speed; time: string }) {
  const line = speed === 'untimed'
  return (
    <svg className={`speed-icon ${speed}`} viewBox="0 0 24 24" role="img" aria-label={`${SPEED_LABEL[speed]}, ${time}`}>
      <title>{speed === 'untimed' ? time : `${SPEED_LABEL[speed]} · ${time}`}</title>
      <path d={SPEED_ICON[speed]} fill={line ? 'none' : 'currentColor'} stroke={line ? 'currentColor' : undefined} strokeWidth={line ? 2.2 : undefined} />
    </svg>
  )
}
