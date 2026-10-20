import { Chess } from 'chess.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StockfishEngine, type AnalysisResult, type EngineStrength } from '../engine/Engine'
import { checkmatedScore, type Color } from '../lib/evaluation'
import type { MoveNode } from '../lib/tree'
import type { Score } from '../lib/uci'

/** Engine verdict for one position at a fixed depth, as used by the game review. */
export interface PositionEval {
  score: Score
  bestMove: string | null
  pv: string[]
  depth: number
  /** Score of the second-best move (the review runs MultiPV 2, for "great move" detection). */
  second?: Score
}

export interface TerminalState {
  score: Score
  label: 'Checkmate' | 'Stalemate' | 'Draw'
}

/** Game-over positions are decided by the rules, not the engine. */
export function terminalState(fen: string): TerminalState | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { score: checkmatedScore(chess.turn() === 'w' ? 'white' : 'black'), label: 'Checkmate' }
  if (chess.isStalemate()) return { score: { type: 'cp', value: 0 }, label: 'Stalemate' }
  if (chess.isDraw()) return { score: { type: 'cp', value: 0 }, label: 'Draw' }
  return null
}

function legalMoveCount(fen: string) {
  return new Chess(fen).moves().length
}

/** Calls `fn` at most once per animation frame with the latest value. */
function useFrameThrottle<T>(fn: (value: T) => void) {
  const pending = useRef<{ value: T } | null>(null)
  const frame = useRef<number | null>(null)
  const latestFn = useRef(fn)
  useEffect(() => {
    latestFn.current = fn
  })
  useEffect(() => () => void (frame.current !== null && cancelAnimationFrame(frame.current)), [])
  return useCallback((value: T) => {
    pending.current = { value }
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (pending.current) latestFn.current(pending.current.value)
      pending.current = null
    })
  }, [])
}

interface LiveOptions {
  engine: StockfishEngine | null
  ready: boolean
  fen: string
  enabled: boolean
  multiPv: number
  depth: number
  /** Live analysis pauses while a full review is using the engine. */
  paused: boolean
}

/** Continuous analysis of the position on the board, with a per-position cache. */
export function useLiveAnalysis({ engine, ready, fen, enabled, multiPv, depth, paused }: LiveOptions) {
  const cache = useRef(new Map<string, AnalysisResult>())
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [searching, setSearching] = useState(false)
  const publish = useFrameThrottle<AnalysisResult>((r) => {
    if (r.fen === fen) setResult(r)
  })

  useEffect(() => {
    const cached = cache.current.get(fen)
    // Show whatever we already know about this position straight away.
    setResult(cached ?? null)

    if (!engine || !ready || !enabled || paused || terminalState(fen)) {
      setSearching(false)
      return
    }
    const wanted = Math.min(multiPv, legalMoveCount(fen))
    if (cached && cached.depth >= depth && cached.lines.length >= wanted) {
      setSearching(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setSearching(true)
    const remember = (r: AnalysisResult) => {
      const prev = cache.current.get(r.fen)
      if (!prev || r.depth >= prev.depth || r.lines.length > prev.lines.length) cache.current.set(r.fen, r)
    }
    engine
      .analyze({
        fen,
        multiPv: wanted,
        depth,
        signal: controller.signal,
        onUpdate: (r) => {
          if (cancelled) return
          remember(r)
          publish(r)
        },
      })
      .then((r) => {
        if (cancelled) return
        if (r) {
          remember(r)
          setResult(r)
        }
        setSearching(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [engine, ready, fen, enabled, multiPv, depth, paused, publish])

  return { result: result?.fen === fen ? result : null, searching }
}

interface ReviewOptions {
  engine: StockfishEngine | null
  ready: boolean
  depth: number
  strength: EngineStrength
}

export interface ReviewState {
  status: 'idle' | 'running' | 'done'
  /** Number of main-line positions analysed so far. */
  progress: number
  total: number
  /** Results keyed by FEN. */
  evals: Record<string, PositionEval>
}

/**
 * Per-position node cap for a review, so one hard position can't hold up the whole game.
 * Nodes rather than time, so a busy CPU can't cut a search short and change the verdict.
 * At depth 16 positions from real games need ~0.3M nodes (median), a few over 2M.
 */
export function reviewNodeCap(depth: number) {
  return depth <= 12 ? 1_000_000 : depth <= 16 ? 5_000_000 : 20_000_000
}

/** Every review search uses the same hash size, whichever engine runs it: the size changes the result. */
const REVIEW_HASH_MB = 32

/**
 * How many extra engines to start for a review. Fixed-depth searches finish far
 * sooner on several single-threaded engines than on one multi-threaded one
 * (benchmarked: 3×1 thread is ~10× faster than 1×11 threads in WASM), but each
 * full engine costs ~600 MB, so stay modest.
 */
export function extraReviewEngines(): number {
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory !== undefined && memory < 4) return 0
  if (cores >= 6 && (memory === undefined || memory >= 8)) return 2
  return cores >= 4 ? 1 : 0
}

/**
 * One position as the review sees it: a fresh single-thread search of a fixed size, to a fixed
 * depth or node count, so the same position gets the same verdict on every run.
 */
async function reviewSearch(eng: StockfishEngine, fen: string, depth: number, signal: AbortSignal, live: () => boolean): Promise<PositionEval | undefined> {
  const terminal = terminalState(fen)
  if (terminal) return { score: terminal.score, bestMove: null, pv: [], depth }
  // A search can be bumped (or its worker restarted); retry a couple of times before skipping.
  for (let attempt = 0; attempt < 3 && live(); attempt++) {
    const result = await eng.analyze({
      fen,
      multiPv: Math.min(2, legalMoveCount(fen)),
      depth,
      nodes: reviewNodeCap(depth),
      threads: 1,
      hashMb: REVIEW_HASH_MB,
      fresh: true,
      signal,
    })
    const [top, second] = result?.lines ?? []
    if (top) return { score: top.score, bestMove: result!.bestMove, pv: top.pv, depth: top.depth, second: second?.score }
  }
  return undefined
}

/** The depth a finished review ran at: most positions reach it exactly (the rest hit the node cap first). */
export function depthOfReview(evals: Record<string, PositionEval>): number | null {
  const tally = new Map<number, number>()
  for (const e of Object.values(evals)) if (e.pv.length) tally.set(e.depth, (tally.get(e.depth) ?? 0) + 1)
  let best: number | null = null
  for (const [d, n] of tally) if (best === null || n > tally.get(best)! || (n === tally.get(best) && d > best)) best = d
  return best
}

/**
 * Analyses every main-line position at a fixed depth. Positions are handed out
 * in order from one queue to a small pool of single-threaded searches: the main
 * engine plus a few short-lived helpers that are shut down when the review ends.
 */
export function useGameReview({ engine, ready, depth, strength }: ReviewOptions) {
  const [state, setState] = useState<ReviewState>({ status: 'idle', progress: 0, total: 0, evals: {} })
  const runId = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const abortRun = () => {
    runId.current++
    controller.current?.abort()
    controller.current = null
  }

  const cancel = useCallback(() => {
    abortRun()
    setState((s) => (s.status === 'running' ? { ...s, status: 'idle' } : s))
  }, [])

  const reset = useCallback(() => {
    abortRun()
    setState({ status: 'idle', progress: 0, total: 0, evals: {} })
  }, [])

  // A new engine (strength changed) can't continue a half-finished run.
  useEffect(() => cancel, [engine, cancel])

  /** Restore results saved from an earlier session. */
  const hydrate = useCallback((evals: Record<string, PositionEval>) => {
    const total = Object.keys(evals).length
    setState({ status: 'done', progress: total, total, evals })
  }, [])

  const start = useCallback(
    async (line: MoveNode[]) => {
      if (!engine || !ready) return
      abortRun()
      const id = runId.current
      const ctrl = new AbortController()
      controller.current = ctrl
      setState({ status: 'running', progress: 0, total: line.length, evals: {} })

      const helpers = Array.from({ length: Math.min(extraReviewEngines(), line.length - 1) }, () => new StockfishEngine(strength, { threads: 1, hashMb: REVIEW_HASH_MB }))
      const live = () => runId.current === id
      let next = 0

      const work = async (eng: StockfishEngine) => {
        try {
          await eng.ready
        } catch {
          return // A helper that fails to load just doesn't take part.
        }
        while (live() && next < line.length) {
          const { fen } = line[next++]
          const entry = await reviewSearch(eng, fen, depth, ctrl.signal, live)
          if (!live()) return
          setState((s) => ({ ...s, progress: s.progress + 1, evals: entry ? { ...s.evals, [fen]: entry } : s.evals }))
        }
      }

      try {
        await Promise.all([engine, ...helpers].map(work))
      } finally {
        helpers.forEach((h) => h.terminate())
      }
      if (live()) setState((s) => ({ ...s, status: 'done', progress: line.length }))
    },
    [engine, ready, depth, strength],
  )

  return { review: state, startReview: start, cancelReview: cancel, resetReview: reset, hydrateReview: hydrate }
}

export type { Color }

interface SideLineOptions {
  engine: StockfishEngine | null
  ready: boolean
  /** The positions the review already has. */
  evals: Record<string, PositionEval>
  /** Positions to grade moves into: the side line on the board, from where it leaves the game. */
  fens: string[]
  depth: number
  enabled: boolean
}

/**
 * Moves tried off the main line get the same verdicts as the game's own: their positions are
 * searched exactly as the review searches, one at a time on the main engine (live analysis
 * pauses meanwhile). Results are kept, keyed by FEN, until the review is reset.
 */
export function useSideLineReview({ engine, ready, evals, fens, depth, enabled }: SideLineOptions) {
  const [extra, setExtra] = useState<Record<string, PositionEval>>({})
  const [pending, setPending] = useState(false)
  const missing = enabled ? fens.filter((f) => !evals[f] && !extra[f]) : []
  const wanted = missing.join(',')

  // A new game or review starts over (positions repeat between games, but the depth may not).
  useEffect(() => setExtra({}), [evals, depth])

  useEffect(() => {
    if (!engine || !ready || !wanted) {
      setPending(false)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setPending(true)
    void (async () => {
      for (const fen of wanted.split(',')) {
        const entry = await reviewSearch(engine, fen, depth, controller.signal, () => !cancelled)
        if (cancelled) return
        if (entry) setExtra((x) => ({ ...x, [fen]: entry }))
      }
      if (!cancelled) setPending(false)
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [engine, ready, wanted, depth])

  return { evals: extra, pending: pending || missing.length > 0 }
}
