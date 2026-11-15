// The online game you last set up (its time, rated or not, the friend and your side), kept between visits so
// Play and Home's Play card offer the same one, and Home's way of asking Play to look for an opponent.
import { isOnlineClock, type OnlineClock, type Side } from './lichessPlay'

export interface OnlineSetup {
  clock: OnlineClock
  rated: boolean
  /** Play a friend: their Lichess username, and your side. */
  friend: string
  color: Side | 'random'
}

export const DEFAULT_ONLINE: OnlineSetup = { clock: '10+0', rated: true, friend: '', color: 'random' }

const KEY = 'rookahead.onlineSetup'
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

export function loadOnlineSetup(storage = defaultStorage()): OnlineSetup {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return {
      clock: isOnlineClock(raw?.clock) ? raw.clock : DEFAULT_ONLINE.clock,
      rated: raw?.rated !== false,
      friend: typeof raw?.friend === 'string' ? raw.friend : '',
      color: raw?.color === 'white' || raw?.color === 'black' ? raw.color : 'random',
    }
  } catch {
    return DEFAULT_ONLINE
  }
}

export function saveOnlineSetup(s: OnlineSetup, storage = defaultStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(s))
  } catch {
    // Not remembered.
  }
}

// Home's Play button saves the setup, asks, and goes to Play online: Play starts the search as it shows.
let asked = false

export const askForSeek = () => {
  asked = true
}

/** Whether a search was asked for, once: asking again takes another press. */
export function takeSeekAsk(): boolean {
  const was = asked
  asked = false
  return was
}
