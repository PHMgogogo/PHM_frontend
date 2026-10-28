import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInstanceState } from '@/api/instance-worker'

const stateBody = {
  state: 'LOADED',
  result: [{ loss: 1.2, ids: [0], outputs: [[1, 2]], columns: ['A', 'B'] }],
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('getInstanceState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the gateway instance root path first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(stateBody))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getInstanceState('instance-1', 1)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/instance-1/state/1')
    expect(result.state).toBe('LOADED')
  })

  it('falls back to the Vite /instance proxy when the root path returns HTML', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }))
      .mockResolvedValueOnce(jsonResponse(stateBody))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getInstanceState('instance-1', 1)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/instance/instance-1/state/1')
    expect(result.result?.[0]?.columns).toEqual(['A', 'B'])
  })

  it('falls back when the gateway returns no match', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('no match', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(stateBody))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getInstanceState('instance-1', 1)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.state).toBe('LOADED')
  })
})
