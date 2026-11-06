import { describe, expect, it, vi } from 'vitest'
import { CoachClient, type CoachReply, type CoachRequest } from './coachClient'

function setup() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as ((event: MessageEvent<CoachReply>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
  }
  const createWorker = vi.fn(() => worker)
  const client = new CoachClient(createWorker)
  const request: CoachRequest = {
    input: { fenBefore: 'start', uci: 'e2e4', san: 'e4', cls: 'best', best: { pv: [], score: { type: 'cp', value: 0 } }, reply: { pv: [], score: { type: 'cp', value: 0 } } },
    you: 'white',
  }
  const reply = (id: number, text: string | null) => worker.onmessage?.({ data: { id, text } } as MessageEvent<CoachReply>)
  return { worker, createWorker, client, request, reply }
}

describe('background coach commentary', () => {
  it('does no calculation or worker startup until commentary is requested', () => {
    const { client, createWorker, request, worker, reply } = setup()
    const publish = vi.fn()
    expect(createWorker).not.toHaveBeenCalled()
    client.request('first', request, publish)
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, ...request })
    expect(publish).not.toHaveBeenCalled()
    reply(1, 'A classic e4.')
    expect(publish).toHaveBeenCalledWith('A classic e4.')
  })

  it('skips passed positions and never publishes a stale move after fast navigation', () => {
    const { client, request, worker, reply } = setup()
    const first = vi.fn(), passed = vi.fn(), latest = vi.fn()
    const cancel = client.request('first', request, first)
    cancel()
    client.request('passed', request, passed)
    client.request('latest', request, latest)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    reply(1, 'Old move')
    expect(first).not.toHaveBeenCalled()
    expect(passed).not.toHaveBeenCalled()
    expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 3, ...request })
    reply(3, 'Current move')
    expect(latest).toHaveBeenCalledWith('Current move')
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
  })

  it('reuses commentary on a revisit, including an empty result', () => {
    const { client, request, worker, reply } = setup()
    client.request('first', request, vi.fn())
    reply(1, null)
    const cached = vi.fn()
    client.request('first', request, cached)
    expect(cached).toHaveBeenCalledWith(null)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })

  it('drops a queued position on leaving the review and cleans up the worker', () => {
    const { client, request, worker, reply } = setup()
    const publish = vi.fn()
    const cancelFirst = client.request('first', request, publish)
    const cancelNext = client.request('next', request, publish)
    cancelFirst()
    cancelNext()
    reply(1, 'Old move')
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
    client.destroy()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps cached navigation from reviving an obsolete pending move', () => {
    const { client, request, worker, reply } = setup()
    client.request('cached', request, vi.fn())
    reply(1, 'Cached move')
    const stale = vi.fn(), cached = vi.fn()
    client.request('active', request, stale)
    client.request('pending', request, stale)
    client.request('cached', request, cached)
    reply(2, 'Obsolete')
    expect(stale).not.toHaveBeenCalled()
    expect(cached).toHaveBeenCalledWith('Cached move')
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
  })

  it('leaves the immediate verdict available when workers fail, without running a blocking fallback', () => {
    const { client, request, worker } = setup()
    const publish = vi.fn()
    client.request('first', request, publish)
    worker.onerror?.({} as ErrorEvent)
    client.request('next', request, publish)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
  })
})
