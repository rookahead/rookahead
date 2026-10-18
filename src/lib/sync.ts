// One sync pass between this device's stores and the account's copies (see the signup spec).
import { readMeta, STORE_KEYS, SYNC_KEY, SYNCED, writeMeta } from './syncBus'
import { mergeStore, type StoreKey } from './syncMerge'

export interface RemoteRow {
  data: unknown
  rev: number
  /** When it was last written (ms). */
  updatedAt: number
}

/** The account's copies. Writes resolve false when the row isn't at the expected rev (or exists). */
export interface Remote {
  revs(): Promise<Partial<Record<StoreKey, number>>>
  get(key: StoreKey): Promise<RemoteRow | null>
  insert(key: StoreKey, data: unknown): Promise<boolean>
  update(key: StoreKey, data: unknown, baseRev: number): Promise<boolean>
}

const ATTEMPTS = 3
const defaultStorage = (): Storage => localStorage

/** JSON with keys sorted, so two copies compare equal whatever order their keys come in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  )
}

function parse(raw: string | null): unknown {
  try {
    return raw == null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Brings every store and its account copy together for `userId`. Returns the stores rewritten on
 * this device. Throws on network errors; anything unpushed stays marked and goes next time.
 */
export async function syncOnce(remote: Remote, userId: string, storage: Storage = defaultStorage()): Promise<StoreKey[]> {
  // Another account's (or a guest's) data: nothing here has been synced to this account yet.
  if (readMeta(storage).user !== userId) writeMeta({ user: userId, revs: {}, dirty: {} }, storage)
  const changed: StoreKey[] = []
  let revs = await remote.revs()
  for (const key of SYNCED) {
    const before = storage.getItem(STORE_KEYS[key])
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) revs = await remote.revs()
      if (await syncKey(remote, key, revs[key], storage)) break
    }
    if (storage.getItem(STORE_KEYS[key]) !== before) changed.push(key)
  }
  return changed
}

/** Syncs one store; false when the account or the device changed underneath it (try again). */
async function syncKey(remote: Remote, key: StoreKey, remoteRev: number | undefined, storage: Storage): Promise<boolean> {
  const raw = storage.getItem(STORE_KEYS[key])
  const local = parse(raw)
  const start = readMeta(storage)
  const base = start.revs[key]
  const dirtyAt = start.dirty[key]

  /** Records the rev now in the account, and clears the dirty mark unless the store changed meanwhile. */
  const settle = (rev: number) => {
    const meta = readMeta(storage)
    meta.revs[key] = rev
    if (meta.dirty[key] === dirtyAt) delete meta.dirty[key]
    writeMeta(meta, storage)
  }

  if (remoteRev === undefined) {
    if (local == null) return true
    if (!(await remote.insert(key, local))) return false
    settle(1)
    return true
  }
  if (remoteRev === base) {
    if (dirtyAt === undefined) return true
    if (!(await remote.update(key, local, base))) return false
    settle(base + 1)
    return true
  }

  // The account has a version this device hasn't seen.
  const row = await remote.get(key)
  if (!row) return false
  const unsynced = base === undefined
  const next = local != null && (dirtyAt !== undefined || unsynced) ? mergeStore(key, local, row.data, unsynced ? 0 : dirtyAt!, row.updatedAt) : row.data
  // Saved again while we waited: start this store over with the newer copy.
  if (storage.getItem(STORE_KEYS[key]) !== raw) return false
  if (canonical(next) !== canonical(local)) {
    try {
      storage.setItem(STORE_KEYS[key], JSON.stringify(next))
    } catch {
      return true // No room: leave it for the next pass.
    }
  }
  if (canonical(next) === canonical(row.data)) {
    settle(row.rev)
    return true
  }
  if (!(await remote.update(key, next, row.rev))) return false
  settle(row.rev + 1)
  return true
}

/** Logging out: this device's copies of the account's stores go (they stay in the account). */
export function forgetLocal(storage: Storage = defaultStorage()): void {
  for (const key of [...Object.values(STORE_KEYS), SYNC_KEY]) storage.removeItem(key)
}
