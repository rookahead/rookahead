import { describe, expect, it } from 'vitest'
import { forgetLocal, syncOnce, type Remote, type RemoteRow } from './sync'
import { markChanged, readMeta, STORE_KEYS } from './syncBus'
import type { StoreKey } from './syncMerge'

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

/** An in-memory account, with optional hooks to simulate another device writing mid-pass. */
function fakeRemote(rows: Partial<Record<StoreKey, RemoteRow>> = {}) {
  const writes: string[] = []
  let beforeWrite: (() => void) | undefined
  const remote: Remote = {
    revs: async () => Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, r!.rev])),
    get: async (key) => rows[key] ?? null,
    insert: async (key, data) => {
      beforeWrite?.()
      if (rows[key]) return false
      rows[key] = { data, rev: 1, updatedAt: 1 }
      writes.push(`insert ${key}`)
      return true
    },
    update: async (key, data, baseRev) => {
      beforeWrite?.()
      const row = rows[key]
      if (!row || row.rev !== baseRev) return false
      rows[key] = { data, rev: baseRev + 1, updatedAt: 2 }
      writes.push(`update ${key}`)
      return true
    },
  }
  return { remote, rows, writes, onWrite: (f: () => void) => (beforeWrite = f) }
}

const put = (s: Storage, key: StoreKey, value: unknown) => s.setItem(STORE_KEYS[key], JSON.stringify(value))
const get = (s: Storage, key: StoreKey) => JSON.parse(s.getItem(STORE_KEYS[key]) ?? 'null')
const game = (id: string, endedAt: number) => ({ id, endedAt })

describe('syncOnce', () => {
  it('uploads a guest’s data on first sign-in to an empty account', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, rows } = fakeRemote()
    await syncOnce(remote, 'u1', s)
    expect(rows.games?.data).toEqual([game('a', 1)])
    expect(readMeta(s)).toEqual({ user: 'u1', revs: { games: 1 }, dirty: {} })
  })

  it('merges a guest’s data into an existing account and reports what changed', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, rows } = fakeRemote({ games: { data: [game('b', 2)], rev: 4, updatedAt: 0 } })
    const changed = await syncOnce(remote, 'u1', s)
    expect(changed).toEqual(['games'])
    expect(get(s, 'games')).toEqual([game('b', 2), game('a', 1)])
    expect(rows.games).toMatchObject({ rev: 5, data: [game('b', 2), game('a', 1)] })
    expect(readMeta(s).revs.games).toBe(5)
  })

  it('lets account settings win over a guest’s on first sign-in', async () => {
    const s = memoryStorage()
    put(s, 'settings', { boardTheme: 'green', engine: 'full' })
    const { remote } = fakeRemote({ settings: { data: { boardTheme: 'brown', engine: 'lite' }, rev: 1, updatedAt: 5 } })
    await syncOnce(remote, 'u1', s)
    expect(get(s, 'settings')).toEqual({ boardTheme: 'brown', engine: 'full' })
  })

  it('pushes a local change, and only that', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, writes } = fakeRemote()
    await syncOnce(remote, 'u1', s)
    put(s, 'games', [game('b', 2), game('a', 1)])
    markChanged('games', s)
    await syncOnce(remote, 'u1', s)
    await syncOnce(remote, 'u1', s)
    expect(writes).toEqual(['insert games', 'update games'])
    expect(readMeta(s).dirty).toEqual({})
  })

  it('takes the account’s copy when nothing changed here', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, rows } = fakeRemote()
    await syncOnce(remote, 'u1', s)
    rows.games = { data: [game('c', 9)], rev: 2, updatedAt: 3 }
    expect(await syncOnce(remote, 'u1', s)).toEqual(['games'])
    expect(get(s, 'games')).toEqual([game('c', 9)])
  })

  it('merges when both sides changed', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, rows } = fakeRemote()
    await syncOnce(remote, 'u1', s)
    rows.games = { data: [game('a', 1), game('r', 5)], rev: 2, updatedAt: 3 }
    put(s, 'games', [game('l', 4), game('a', 1)])
    markChanged('games', s)
    await syncOnce(remote, 'u1', s)
    const ids = ['r', 'l', 'a']
    expect(get(s, 'games').map((g: { id: string }) => g.id)).toEqual(ids)
    expect((rows.games!.data as { id: string }[]).map((g) => g.id)).toEqual(ids)
    expect(rows.games!.rev).toBe(3)
  })

  it('retries when another device writes first', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, rows, onWrite } = fakeRemote({ games: { data: [], rev: 1, updatedAt: 0 } })
    let raced = false
    onWrite(() => {
      if (raced) return
      raced = true
      rows.games = { data: [game('z', 7)], rev: 2, updatedAt: 1 }
    })
    await syncOnce(remote, 'u1', s)
    expect((rows.games!.data as { id: string }[]).map((g) => g.id)).toEqual(['z', 'a'])
    expect(get(s, 'games').map((g: { id: string }) => g.id)).toEqual(['z', 'a'])
  })

  it('does not write over a change made while the pass was running', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const { remote, onWrite } = fakeRemote()
    let changedMidway = false
    onWrite(() => {
      if (changedMidway) return
      changedMidway = true
      put(s, 'games', [game('b', 2), game('a', 1)])
      markChanged('games', s)
    })
    await syncOnce(remote, 'u1', s)
    expect(readMeta(s).dirty.games).toBeDefined()
    await syncOnce(remote, 'u1', s)
    expect(readMeta(s).dirty).toEqual({})
  })

  it('treats a different user’s device data as never synced', async () => {
    const s = memoryStorage()
    put(s, 'games', [game('a', 1)])
    const first = fakeRemote()
    await syncOnce(first.remote, 'u1', s)
    const second = fakeRemote({ games: { data: [game('b', 2)], rev: 7, updatedAt: 0 } })
    await syncOnce(second.remote, 'u2', s)
    expect(readMeta(s).user).toBe('u2')
    expect((second.rows.games!.data as { id: string }[]).map((g) => g.id)).toEqual(['b', 'a'])
  })

  it('does not count key order as a change', async () => {
    const s = memoryStorage()
    s.setItem(STORE_KEYS.settings, '{"a":1,"b":2}')
    const { remote, writes } = fakeRemote({ settings: { data: { b: 2, a: 1 }, rev: 1, updatedAt: 0 } })
    expect(await syncOnce(remote, 'u1', s)).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('markChanged', () => {
  it('only tracks changes for a signed-in device', () => {
    const s = memoryStorage()
    markChanged('games', s)
    expect(readMeta(s).dirty).toEqual({})
  })
})

describe('forgetLocal', () => {
  it('removes the synced stores and the sync state, nothing else', () => {
    const s = memoryStorage()
    put(s, 'games', [])
    s.setItem('rookahead.sidebar', 'rail')
    s.setItem('rookahead.sync.v1', '{}')
    forgetLocal(s)
    expect(s.length).toBe(1)
    expect(s.getItem('rookahead.sidebar')).toBe('rail')
  })
})
