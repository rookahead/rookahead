import { useEffect, useState } from 'react'
import { StockfishEngine, type EngineStatus, type EngineStrength } from '../engine/Engine'

/** Owns one Stockfish worker; swaps it out when the strength setting changes. */
export function useEngine(strength: EngineStrength) {
  const [engine, setEngine] = useState<StockfishEngine | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)

  useEffect(() => {
    const instance = new StockfishEngine(strength)
    setEngine(instance)
    setStatus(instance.status)
    const unsubscribe = instance.subscribe(setStatus)
    return () => {
      unsubscribe()
      instance.terminate()
    }
  }, [strength])

  return { engine, status }
}
