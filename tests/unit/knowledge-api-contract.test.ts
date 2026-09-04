import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { deleteDocument, getDocumentList, runRetrieval } from '@/api/document'
import { getChatHistory, submitFeedback } from '@/api/knowledge-agent'

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function expectInvalidResponse(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject<ApiError>({ kind: 'invalid-response' })
}

describe('knowledge API response contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects malformed successful read envelopes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>proxy error</html>', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ session_id: 'session-1' }))
    vi.stubGlobal('fetch', fetchMock)

    await expectInvalidResponse(getDocumentList())
    await expectInvalidResponse(runRetrieval('hybrid', { query: 'bearing' }))
    await expectInvalidResponse(getChatHistory('session-1'))
  })

  it('rejects malformed successful mutation envelopes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ status: 'error', id: 'feedback-1' }))
    vi.stubGlobal('fetch', fetchMock)

    await expectInvalidResponse(deleteDocument('doc-1'))
    await expectInvalidResponse(
      submitFeedback({
        session_id: 'session-1',
        message_id: 'message-1',
        trace_id: 'trace-1',
        feedback_type: 'THUMBS_UP',
        content: '',
        original_answer: 'answer',
        corrected_answer: '',
      }),
    )
  })
})
