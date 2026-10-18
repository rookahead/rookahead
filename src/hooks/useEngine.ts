import { useEffect, useState } from 'react'
import { StockfishEngine, type EngineStatus, type EngineStrength } from '../engine/Engine'

/** Owns one Stockfish worker; swaps it out when the strength setting (or the options) change. */
export function useEngine(strength: EngineStrength, options?: { threads?: number; hashMb?: number }) {
  const threads = options?.threads
  const hashMb = options?.hashMb
  const [engine, setEngine] = useState<StockfishEngine | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)

  useEffect(() => {
    const instance = new StockfishEngine(strength, { threads, hashMb })
    setEngine(instance)
    setStatus(instance.status)
    const unsubscribe = instance.subscribe(setStatus)
    return () => {
      unsubscribe()
      instance.terminate()
    }
  }, [strength, threads, hashMb])

  return { engine, status }
}
