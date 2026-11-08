import { useEffect, useRef, useState } from 'react'
import { CoachClient, type CoachRequest } from '../lib/coachClient'
import type { Color } from '../lib/evaluation'
import type { ExplainInput } from '../lib/explain'

/** The verdict appears immediately; the detailed commentary arrives without blocking a frame. */
export function useCoachLine(input: ExplainInput | null, you: Color | null, opening?: string): string | null {
  const client = useRef<CoachClient | null>(null)
  const [result, setResult] = useState<{ key: string; text: string | null } | null>(null)
  // Evals can be republished as fresh objects. Only changed commentary inputs warrant another job.
  const key = input ? JSON.stringify({ input, you, opening } satisfies CoachRequest) : null

  useEffect(() => () => {
    client.current?.destroy()
    client.current = null
  }, [])

  useEffect(() => {
    if (!key) return
    client.current ??= new CoachClient()
    return client.current.request(key, JSON.parse(key) as CoachRequest, (text) => setResult({ key, text }))
  }, [key])

  return result?.key === key ? result.text : null
}
