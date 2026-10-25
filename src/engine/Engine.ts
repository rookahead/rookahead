import { toWhitePov, type Color } from '../lib/evaluation'
import { parseBestMove, parseInfo, type Score } from '../lib/uci'

// A thin, promise-based wrapper around the Stockfish web worker.
//
// The engine can only run one search at a time, so requests go through a
// single "next up" slot: asking for a new analysis while one is running stops
// the current search, and a request still waiting in the slot is dropped
// (resolved with null) when a newer one replaces it. That's exactly what live
// analysis wants when you click through moves quickly, and a sequential caller
// (the game review) that awaits each search never notices.
//
// A watchdog guards against the worker wedging: a search that goes silent is
// stopped, and if the engine doesn't answer the stop, the worker is replaced.

export type EngineStrength = 'full' | 'lite'

export interface EngineLine {
  multipv: number
  depth: number
  /** Always from White's point of view. */
  score: Score
  /** Win/draw/loss per mille, from White's point of view. */
  wdl?: [number, number, number]
  pv: string[]
}

export interface AnalysisResult {
  fen: string
  depth: number
  lines: EngineLine[]
  bestMove: string | null
  nodes?: number
  nps?: number
}

export interface AnalyzeRequest {
  fen: string
  multiPv: number
  depth?: number
  /** Time cap in ms; combined with `depth`, the search ends at whichever is reached first. */
  movetime?: number
  /** Node cap: like `movetime`, but the same on every machine and under any load. */
  nodes?: number
  /**
   * Forget everything from earlier searches first. With one thread and a depth or node
   * limit, the result is then the same every time.
   */
  fresh?: boolean
  /** Threads for this search (default: the engine's full allowance). */
  threads?: number
  /** Hash table size for this search (default: the engine's own). The size changes the result. */
  hashMb?: number
  /**
   * Play weaker (the computer opponent): `elo` uses Stockfish's Elo limiter (≥ 1320), `skill` its
   * Skill Level 0–20. Searches without it run at full strength.
   */
  strength?: { skill?: number; elo?: number }
  onUpdate?: (result: AnalysisResult) => void
  /** Aborting stops this search (or drops it if it hasn't started) without touching others. */
  signal?: AbortSignal
}

export interface EngineStatus {
  state: 'loading' | 'ready' | 'error'
  /** Download progress of the network file, 0–1, while loading. */
  progress?: number
  name?: string
  threads: number
  multiThreaded: boolean
  error?: string
  /** How many times the watchdog had to replace a stuck worker. */
  restarts: number
}

/** A search that prints nothing for this long is considered stuck and is stopped. */
export const SILENCE_TIMEOUT_MS = 20_000
/** If `stop` isn't answered with `bestmove` within this time, the worker is replaced. */
export const STOP_TIMEOUT_MS = 5_000

interface Job extends AnalyzeRequest {
  resolve: (result: AnalysisResult | null) => void
  result: AnalysisResult
  turn: Color
}

// Set localStorage "rookahead.debug" to log every UCI line to the console.
const DEBUG = (() => {
  try {
    return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('rookahead.debug'))
  } catch {
    return false
  }
})()

/** The public web build ships only the Lite network: the Full one (~100 MB) is too big for the host. */
export const FULL_ENGINE_AVAILABLE = import.meta.env.VITE_LITE_ONLY !== 'true'

export function engineFile(strength: EngineStrength, multiThreaded: boolean) {
  const base = `${import.meta.env.BASE_URL}engine/stockfish-19`
  return `${base}${strength === 'lite' ? '-lite' : ''}${multiThreaded ? '' : '-single'}.js`
}

/**
 * Threads for "Auto": two thirds of the cores. Taking all but one starves the browser's own
 * rendering, and the board drops frames while the engine runs (measured on 12 cores: 0 dropped
 * frames at 8 threads, dozens at 11, for ~10% fewer nodes per second).
 */
export function autoThreads() {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(1, cores - Math.ceil(cores / 3))
}

export class StockfishEngine {
  ready: Promise<void>
  status: EngineStatus

  private worker!: Worker
  private current: Job | null = null
  private queued: Job | null = null
  private stopping = false
  private multiPv = 1
  private listeners = new Set<(status: EngineStatus) => void>()
  private waiters: { match: (line: string) => boolean; resolve: () => void }[] = []
  private lastOutputAt = 0
  private stopSentAt = 0
  private watchdog: ReturnType<typeof setInterval>
  private readonly strength: EngineStrength
  private readonly hashMb: number
  private activeThreads = 0
  private activeHashMb = 0
  /** Strength options as last sent; a new worker starts at full strength. */
  private activeLimit = false
  private activeElo: number | null = null
  private activeSkill = 20

  /** `singleThreaded` picks the build without shared memory even where threads are available. */
  constructor(strength: EngineStrength, opts: { hashMb?: number; threads?: number; singleThreaded?: boolean } = {}) {
    const multiThreaded = !opts.singleThreaded && typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    const threads = multiThreaded ? Math.max(1, Math.min(opts.threads ?? autoThreads(), 32)) : 1
    this.strength = strength
    this.hashMb = opts.hashMb ?? 128
    this.status = { state: 'loading', threads, multiThreaded, progress: 0, restarts: 0 }
    this.ready = this.spawn()
    this.watchdog = setInterval(() => this.checkHealth(), 1000)
  }

  private spawn(): Promise<void> {
    const worker = new Worker(engineFile(this.strength, this.status.multiThreaded))
    this.worker = worker
    this.multiPv = 1
    this.activeThreads = 0
    this.waiters = []
    // Ignore anything a replaced worker still manages to send.
    worker.onmessage = (e) => this.worker === worker && this.onMessage(e.data)
    worker.onerror = (e) => {
      if (this.worker === worker) this.setStatus({ state: 'error', error: e.message || 'The engine failed to load.' })
    }
    return this.init().catch((err) => {
      this.setStatus({ state: 'error', error: String(err) })
      throw err
    })
  }

  subscribe(fn: (status: EngineStatus) => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  /** Analyse a position. Resolves with the final result, or null if superseded before starting. */
  analyze(request: AnalyzeRequest): Promise<AnalysisResult | null> {
    return new Promise((resolve) => {
      if (request.signal?.aborted) return resolve(null)
      const turn: Color = request.fen.split(' ')[1] === 'b' ? 'black' : 'white'
      const job: Job = { ...request, resolve, turn, result: { fen: request.fen, depth: 0, lines: [], bestMove: null } }
      request.signal?.addEventListener('abort', () => this.cancel(job), { once: true })
      this.queued?.resolve(null)
      this.queued = job
      if (this.current) this.stopCurrent()
      else void this.ready.then(() => this.startNext(), () => {})
    })
  }

  /** Stop whatever is running and drop anything waiting. */
  stop() {
    this.queued?.resolve(null)
    this.queued = null
    if (this.current) this.stopCurrent()
  }

  private cancel(job: Job) {
    if (this.queued === job) {
      this.queued = null
      job.resolve(null)
    } else if (this.current === job) {
      this.stopCurrent()
    }
  }

  terminate() {
    this.stop()
    clearInterval(this.watchdog)
    this.worker.terminate()
    this.listeners.clear()
  }

  private checkHealth() {
    if (!this.current) return
    const now = Date.now()
    if (this.stopping) {
      if (now - this.stopSentAt > STOP_TIMEOUT_MS) this.restart()
    } else if (now - this.lastOutputAt > SILENCE_TIMEOUT_MS) {
      console.warn('[engine] search went silent; stopping it')
      this.stopCurrent()
    }
  }

  /** Replace a wedged worker. The stuck search resolves with whatever it had found. */
  private restart() {
    console.warn('[engine] worker did not respond to stop; restarting it')
    const job = this.current
    this.current = null
    this.stopping = false
    this.worker.terminate()
    this.setStatus({ state: 'loading', restarts: this.status.restarts + 1 })
    job?.resolve(job.result.lines.length ? job.result : null)
    this.ready = this.spawn()
    void this.ready.then(() => this.startNext(), () => {})
  }

  private async init() {
    const { threads } = this.status
    this.activeThreads = threads
    // The worker can stream download progress of its ~100MB network file.
    this.send('setoption name CanOutputEngineDownloadProgress')
    this.send('uci')
    await this.waitFor((l) => l === 'uciok')
    this.send(`setoption name Threads value ${threads}`)
    this.send(`setoption name Hash value ${this.hashMb}`)
    this.activeHashMb = this.hashMb
    this.activeLimit = false
    this.activeElo = null
    this.activeSkill = 20
    this.send('setoption name UCI_ShowWDL value true')
    this.send('isready')
    await this.waitFor((l) => l === 'readyok')
    this.setStatus({ state: 'ready', progress: 1 })
  }

  private startNext() {
    if (this.current || !this.queued || this.status.state !== 'ready') return
    const job = this.queued
    this.queued = null
    this.current = job
    this.stopping = false
    this.lastOutputAt = Date.now()
    const threads = Math.min(job.threads ?? this.status.threads, this.status.threads)
    if (threads !== this.activeThreads) {
      this.activeThreads = threads
      this.send(`setoption name Threads value ${threads}`)
    }
    const hashMb = job.hashMb ?? this.hashMb
    if (hashMb !== this.activeHashMb) {
      this.activeHashMb = hashMb
      this.send(`setoption name Hash value ${hashMb}`)
    }
    if (job.multiPv !== this.multiPv) {
      this.multiPv = job.multiPv
      this.send(`setoption name MultiPV value ${job.multiPv}`)
    }
    const limit = job.strength?.elo !== undefined
    if (limit !== this.activeLimit) {
      this.activeLimit = limit
      this.send(`setoption name UCI_LimitStrength value ${limit}`)
    }
    if (limit && job.strength!.elo !== this.activeElo) {
      this.activeElo = job.strength!.elo!
      this.send(`setoption name UCI_Elo value ${this.activeElo}`)
    }
    const skill = job.strength?.skill ?? 20
    if (skill !== this.activeSkill) {
      this.activeSkill = skill
      this.send(`setoption name Skill Level value ${skill}`)
    }
    if (job.fresh) this.send('ucinewgame')
    this.send(`position fen ${job.fen}`)
    // With several limits set, Stockfish stops at whichever comes first.
    const limits = [job.depth && `depth ${job.depth}`, job.nodes && `nodes ${job.nodes}`, job.movetime && `movetime ${job.movetime}`].filter(Boolean)
    this.send(`go ${limits.join(' ') || 'infinite'}`)
  }

  private stopCurrent() {
    if (this.stopping) return
    this.stopping = true
    this.stopSentAt = Date.now()
    this.send('stop')
  }

  private onMessage(data: unknown) {
    if (typeof data !== 'string') return
    if (DEBUG) console.debug('[engine <]', data)
    this.lastOutputAt = Date.now()
    for (const raw of data.split('\n')) {
      const line = raw.trim()
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string) {
    if (line === 'info WillOutputEngineDownloadProgress') {
      const channel = new MessageChannel()
      channel.port1.onmessage = (e) => {
        const percent = Number(e.data?.percent)
        if (Number.isFinite(percent) && this.status.state === 'loading') this.setStatus({ progress: percent })
      }
      this.worker.postMessage({ progressPort: channel.port2 }, [channel.port2])
      return
    }
    if (line.startsWith('id name ')) this.setStatus({ name: line.slice(8) })

    const waiter = this.waiters.find((w) => w.match(line))
    if (waiter) {
      this.waiters = this.waiters.filter((w) => w !== waiter)
      waiter.resolve()
    }

    const job = this.current
    if (!job) return

    const info = parseInfo(line)
    if (info) {
      // Aspiration-window bounds are provisional; only use them if we have nothing better.
      const existing = job.result.lines.find((l) => l.multipv === info.multipv)
      if (info.bound && existing) return
      const score = toWhitePov(info.score, job.turn)
      const wdl = info.wdl && (job.turn === 'white' ? info.wdl : ([info.wdl[2], info.wdl[1], info.wdl[0]] as [number, number, number]))
      const entry: EngineLine = { multipv: info.multipv, depth: info.depth, score, wdl, pv: info.pv }
      const lines = job.result.lines.filter((l) => l.multipv !== info.multipv)
      lines.push(entry)
      lines.sort((a, b) => a.multipv - b.multipv)
      job.result = {
        ...job.result,
        lines,
        depth: info.multipv === 1 ? info.depth : job.result.depth,
        nodes: info.nodes ?? job.result.nodes,
        nps: info.nps ?? job.result.nps,
      }
      job.onUpdate?.(job.result)
      return
    }

    const best = parseBestMove(line)
    if (best !== undefined) {
      job.result = { ...job.result, bestMove: best ?? null }
      this.current = null
      this.stopping = false
      job.resolve(job.result)
      this.startNext()
    }
  }

  private waitFor(match: (line: string) => boolean) {
    return new Promise<void>((resolve) => this.waiters.push({ match, resolve }))
  }

  private send(cmd: string) {
    if (DEBUG) console.debug('[engine >]', cmd)
    this.worker.postMessage(cmd)
  }

  private setStatus(patch: Partial<EngineStatus>) {
    this.status = { ...this.status, ...patch }
    for (const fn of this.listeners) fn(this.status)
  }
}
