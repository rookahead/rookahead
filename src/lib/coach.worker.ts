import { coachLine } from './coach'
import type { CoachReply, CoachRequest } from './coachClient'

self.onmessage = ({ data }: MessageEvent<CoachRequest & { id: number }>) => {
  let text: string | null = null
  try {
    text = coachLine(data.input, data.you, data.opening)
  } catch {
    // A malformed saved line should leave the move's basic verdict available.
  }
  self.postMessage({ id: data.id, text } satisfies CoachReply)
}
