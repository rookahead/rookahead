import { describe, expect, it } from 'vitest'
import { askForSeek, DEFAULT_ONLINE, loadOnlineSetup, saveOnlineSetup, takeSeekAsk } from './onlineSetup'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
}

describe('the online setup', () => {
  it('starts as a rated 10+0 game against anyone', () => {
    expect(loadOnlineSetup(memoryStorage())).toEqual(DEFAULT_ONLINE)
    expect(DEFAULT_ONLINE).toEqual({ clock: '10+0', rated: true, friend: '', color: 'random' })
  })

  it('comes back as it was saved', () => {
    const storage = memoryStorage()
    saveOnlineSetup({ clock: '15+10', rated: false, friend: 'mira', color: 'black' }, storage)
    expect(loadOnlineSetup(storage)).toEqual({ clock: '15+10', rated: false, friend: 'mira', color: 'black' })
  })

  it('keeps what it can of a setup it can’t read', () => {
    const storage = memoryStorage()
    storage.setItem('rookahead.onlineSetup', JSON.stringify({ clock: '3+0', rated: false, friend: 7, color: 'green' }))
    expect(loadOnlineSetup(storage)).toEqual({ clock: '10+0', rated: false, friend: '', color: 'random' })
    storage.setItem('rookahead.onlineSetup', '{')
    expect(loadOnlineSetup(storage)).toEqual(DEFAULT_ONLINE)
  })
})

describe('Home asking Play for a game', () => {
  it('is taken once', () => {
    expect(takeSeekAsk()).toBe(false)
    askForSeek()
    expect(takeSeekAsk()).toBe(true)
    expect(takeSeekAsk()).toBe(false)
  })
})
