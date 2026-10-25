import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SILENCE_TIMEOUT_MS, STOP_TIMEOUT_MS, StockfishEngine } from './Engine'

// A scripted stand-in for the Stockfish worker. Searches don't finish on their
// own: tests decide when to emit info lines and `bestmove`, which lets us
// exercise the stop/supersede logic deterministically.
class FakeWorker {
  static last: FakeWorker
  static created = 0
  /** Simulate a wedged engine that never answers `stop`. */
  static ignoreStop = false
  /** Simulate a browser that can't give the threaded build its shared memory. */
  static threadedOutOfMemory = false
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  received: string[] = []
  searching = false
  url: string

  constructor(url: string) {
    this.url = url
    FakeWorker.last = this
    FakeWorker.created++
  }

  postMessage(cmd: unknown) {
    if (typeof cmd !== 'string') return
    this.received.push(cmd)
    if (cmd === 'uci' && FakeWorker.threadedOutOfMemory && !this.url.includes('-single')) {
      queueMicrotask(() => this.onerror?.({ message: 'RangeError: Out of memory' }))
      return
    }
    if (cmd === 'uci') queueMicrotask(() => this.emit('id name Stockfish 19 WASM', 'uciok'))
    if (cmd === 'isready') queueMicrotask(() => this.emit('readyok'))
    if (cmd.startsWith('go')) this.searching = true
    if (cmd === 'stop' && this.searching && !FakeWorker.ignoreStop) queueMicrotask(() => this.finish('e2e4'))
  }

  emit(...lines: string[]) {
    for (const data of lines) this.onmessage?.({ data })
  }

  finish(best: string) {
    this.searching = false
    this.emit(`bestmove ${best}`)
  }

  terminate() {}
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('crossOriginIsolated', false)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeWorker.ignoreStop = false
  FakeWorker.threadedOutOfMemory = false
})

describe('StockfishEngine', () => {
  it('initialises and reports ready with the engine name', async () => {
    const engine = new StockfishEngine('lite')
    await engine.ready
    expect(engine.status.state).toBe('ready')
    expect(engine.status.name).toBe('Stockfish 19 WASM')
    expect(FakeWorker.last.url).toContain('stockfish-19-lite-single.js')
    expect(FakeWorker.last.received).toContain('setoption name UCI_ShowWDL value true')
  })

  it('streams lines and converts scores to White POV', async () => {
    const engine = new StockfishEngine('full')
    await engine.ready
    const updates: number[] = []
    const done = engine.analyze({ fen: AFTER_E4, multiPv: 2, depth: 10, onUpdate: (r) => updates.push(r.lines.length) })
    await flush()
    const w = FakeWorker.last
    expect(w.received).toContain('setoption name MultiPV value 2')
    expect(w.received).toContain(`position fen ${AFTER_E4}`)
    expect(w.received).toContain('go depth 10')

    w.emit(
      'info depth 10 multipv 1 score cp -30 wdl 10 900 90 nodes 100 nps 1000 pv e7e5 g1f3',
      'info depth 10 multipv 2 score cp -10 lowerbound nodes 100 pv c7c5',
      'info depth 10 multipv 2 score cp 5 nodes 120 pv c7c5 g1f3',
    )
    w.finish('e7e5')
    const result = await done
    expect(result?.bestMove).toBe('e7e5')
    expect(result?.depth).toBe(10)
    // Black to move: -30 for Black is +30 for White; WDL is flipped too.
    expect(result?.lines[0].score).toEqual({ type: 'cp', value: 30 })
    expect(result?.lines[0].wdl).toEqual([90, 900, 10])
    // The lowerbound line is used until a real one arrives.
    expect(result?.lines[1].score).toEqual({ type: 'cp', value: -5 })
    expect(updates).toEqual([1, 2, 2])
  })

  it('limits strength per search and restores full strength afterwards', async () => {
    const engine = new StockfishEngine('lite')
    await engine.ready
    const w = FakeWorker.last
    /** The commands sent to the worker for one search. */
    const run = async (request: Parameters<typeof engine.analyze>[0]) => {
      const start = w.received.length
      const done = engine.analyze(request)
      await flush()
      const sent = w.received.slice(start)
      w.finish('e2e4')
      await done
      return sent
    }

    const elo = await run({ fen: START, multiPv: 1, movetime: 300, strength: { elo: 1600 } })
    expect(elo).toContain('setoption name UCI_LimitStrength value true')
    expect(elo).toContain('setoption name UCI_Elo value 1600')
    expect(elo.indexOf('setoption name UCI_Elo value 1600')).toBeLessThan(elo.indexOf('go movetime 300'))

    const skill = await run({ fen: START, multiPv: 1, depth: 2, strength: { skill: 3 } })
    expect(skill).toContain('setoption name UCI_LimitStrength value false')
    expect(skill).toContain('setoption name Skill Level value 3')

    const full = await run({ fen: START, multiPv: 1, depth: 10 })
    expect(full).toContain('setoption name Skill Level value 20')
    expect(full).not.toContain('setoption name UCI_LimitStrength value true')
    // Nothing changed, so no options are resent.
    expect((await run({ fen: START, multiPv: 1, depth: 10 })).filter((c) => c.startsWith('setoption'))).toEqual([])
  })

  it('a newer request stops the running search; a queued one is dropped', async () => {
    const engine = new StockfishEngine('full')
    await engine.ready
    const w = FakeWorker.last

    const first = engine.analyze({ fen: START, multiPv: 1 })
    await flush()
    expect(w.received.filter((c) => c.startsWith('go'))).toEqual(['go infinite'])

    const second = engine.analyze({ fen: AFTER_E4, multiPv: 1 })
    const third = engine.analyze({ fen: START, multiPv: 1, depth: 5 })
    expect(await second).toBeNull() // replaced in the queue before it started
    expect(await first).not.toBeNull() // stopped, resolves with what it had
    await flush()
    expect(w.received.filter((c) => c === 'stop')).toHaveLength(1)
    expect(w.received.at(-1)).toBe('go depth 5')
    w.finish('d2d4')
    expect((await third)?.bestMove).toBe('d2d4')
  })

  it('aborting one request leaves other work alone', async () => {
    const engine = new StockfishEngine('full')
    await engine.ready
    const w = FakeWorker.last

    const running = engine.analyze({ fen: START, multiPv: 1, depth: 18 })
    await flush()
    const controller = new AbortController()
    const queued = engine.analyze({ fen: AFTER_E4, multiPv: 1, signal: controller.signal })
    controller.abort()
    expect(await queued).toBeNull()

    // The stop issued by the newer request already ended `running`; nothing else should start.
    expect(await running).not.toBeNull()
    await flush()
    expect(w.received.filter((c) => c.startsWith('go'))).toHaveLength(1)

    const pre = new AbortController()
    pre.abort()
    expect(await engine.analyze({ fen: START, multiPv: 1, signal: pre.signal })).toBeNull()
  })

  it('stops a silent search, and replaces a worker that ignores stop', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const engine = new StockfishEngine('full')
    await engine.ready
    const first = FakeWorker.last
    const before = FakeWorker.created

    FakeWorker.ignoreStop = true
    const stuck = engine.analyze({ fen: START, multiPv: 1, depth: 20 })
    await flush()
    first.emit('info depth 5 multipv 1 score cp 20 nodes 10 pv e2e4 e7e5')

    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS + 1500)
    expect(first.received.at(-1)).toBe('stop')
    expect(FakeWorker.created).toBe(before)

    const next = engine.analyze({ fen: AFTER_E4, multiPv: 1, depth: 8 })
    vi.advanceTimersByTime(STOP_TIMEOUT_MS + 1500)
    expect(FakeWorker.created).toBe(before + 1)
    expect(engine.status.restarts).toBe(1)

    // The stuck search resolves with what it had; the queued one runs on the new worker.
    expect((await stuck)?.lines[0].pv).toEqual(['e2e4', 'e7e5'])
    FakeWorker.ignoreStop = false
    await engine.ready
    await flush()
    const replacement = FakeWorker.last
    expect(replacement).not.toBe(first)
    expect(replacement.received).toContain(`position fen ${AFTER_E4}`)
    replacement.finish('e7e5')
    expect((await next)?.bestMove).toBe('e7e5')
    engine.terminate()
  })

  it('reports errors from the worker', async () => {
    const engine = new StockfishEngine('full')
    const states: string[] = []
    engine.subscribe((s) => states.push(s.state))
    FakeWorker.last.onerror?.({ message: 'boom' })
    expect(engine.status).toMatchObject({ state: 'error', error: 'boom' })
    expect(states).toContain('error')
    await expect(engine.ready).rejects.toThrow('boom')
  })

  it('falls back to the single-threaded build when the threaded one runs out of memory', async () => {
    vi.stubGlobal('crossOriginIsolated', true)
    FakeWorker.threadedOutOfMemory = true
    const engine = new StockfishEngine('lite', { threads: 4 })
    await engine.ready
    expect(FakeWorker.last.url).toContain('stockfish-19-lite-single.js')
    expect(engine.status).toMatchObject({ state: 'ready', multiThreaded: false, threads: 1 })
    expect(FakeWorker.last.received).toContain('setoption name Threads value 1')
  })

  it('uses the single-threaded build when asked, even where threads are available', async () => {
    vi.stubGlobal('crossOriginIsolated', true)
    const before = FakeWorker.created
    const engine = new StockfishEngine('lite', { threads: 1, singleThreaded: true })
    await engine.ready
    expect(FakeWorker.created).toBe(before + 1)
    expect(FakeWorker.last.url).toContain('stockfish-19-lite-single.js')
  })
})
