import type { Color } from './evaluation'
import type { ExplainInput } from './explain'

export interface CoachRequest {
  input: ExplainInput
  you: Color
  opening?: string
}

export interface CoachReply {
  id: number
  text: string | null
}

type Job = { id: number; key: string; request: CoachRequest; publish?: (text: string | null) => void }
type CoachWorker = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<CoachReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** One calculation in flight, one latest position waiting. Fast stepping never builds a backlog. */
export class CoachClient {
  private worker: CoachWorker | null = null
  private active: Job | null = null
  private pending: Job | null = null
  private cache = new Map<string, string | null>()
  private serial = 0
  private stopped = false
  private createWorker: () => CoachWorker

  constructor(createWorker: () => CoachWorker = () => new Worker(new URL('./coach.worker.ts', import.meta.url), { type: 'module' })) {
    this.createWorker = createWorker
  }

  request(key: string, request: CoachRequest, publish: (text: string | null) => void): () => void {
    if (this.stopped) return () => {}
    // A new position supersedes both the queued position and any result still being calculated.
    if (this.active) this.active.publish = undefined
    this.pending = null
    if (this.cache.has(key)) {
      publish(this.cache.get(key)!)
      return () => {}
    }
    const job: Job = { id: ++this.serial, key, request, publish }
    if (this.active) this.pending = job
    else this.start(job)
    return () => {
      job.publish = undefined
      if (this.pending === job) this.pending = null
    }
  }

  private start(job: Job) {
    try {
      if (!this.worker) {
        this.worker = this.createWorker()
        this.worker.onmessage = ({ data }) => {
          const done = this.active
          if (!done || data.id !== done.id) return
          this.cache.set(done.key, data.text)
          if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!)
          this.active = null
          done.publish?.(data.text)
          const next = this.pending
          this.pending = null
          if (next) this.start(next)
        }
        this.worker.onerror = () => this.destroy()
      }
      this.active = job
      this.worker.postMessage({ id: job.id, ...job.request })
    } catch {
      // Keep the immediate verdict if workers cannot run; never fall back to blocking the board.
      this.destroy()
    }
  }

  destroy() {
    this.stopped = true
    this.worker?.terminate()
    this.worker = null
    this.active = this.pending = null
    this.cache.clear()
  }
}
