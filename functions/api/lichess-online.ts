// How many people are on Lichess right now (and how many games are going), for Home's Play online card. Lichess
// says it on its lobby socket ({"t":"n","d":players,"r":games}), which lets only its own pages in from a browser,
// so this asks from here and keeps the answer a minute: Lichess hears from us once a minute, however many people
// have Home open. public/_routes.json sends this path here.

interface CacheStorageWithDefault extends CacheStorage {
  default: Cache
}

const TTL_S = 60
const TIMEOUT_MS = 5000

/** One reading from Lichess's lobby, or null when it doesn't answer in time. */
async function readLobby(): Promise<{ players: number; games: number } | null> {
  const sri = Math.random().toString(36).slice(2, 12)
  const res = await fetch(`https://socket.lichess.org/lobby/socket/v5?sri=${sri}`, { headers: { Upgrade: 'websocket' } })
  const ws = (res as Response & { webSocket?: WebSocket & { accept(): void } }).webSocket
  if (!ws) return null
  ws.accept()
  return new Promise((resolve) => {
    const done = (value: { players: number; games: number } | null) => {
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // Already closed.
      }
      resolve(value)
    }
    const timer = setTimeout(() => done(null), TIMEOUT_MS)
    ws.addEventListener('message', (e) => {
      try {
        const m = JSON.parse(String(e.data))
        if (m?.t === 'n' && typeof m.d === 'number') done({ players: m.d, games: typeof m.r === 'number' ? m.r : 0 })
      } catch {
        // Not the count: wait for it.
      }
    })
    ws.addEventListener('close', () => done(null))
    ws.send('null')
  })
}

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  const cache = (caches as CacheStorageWithDefault).default
  const key = new Request(new URL('/api/lichess-online', request.url).toString())
  const hit = await cache.match(key)
  if (hit) return hit
  let reading: { players: number; games: number } | null = null
  try {
    reading = await readLobby()
  } catch {
    // Lichess unreachable: say so, briefly.
  }
  const res = new Response(JSON.stringify(reading ?? { players: null, games: null }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${reading ? TTL_S : 10}` },
  })
  if (reading) await cache.put(key, res.clone())
  return res
}
