import { describe, expect, it } from 'vitest'
import {
  KnowledgePayloadLimitError,
  normalizeChatHistory,
  normalizeDocumentList,
  normalizeKnowledgeStreamEvent,
  normalizePublicMetadata,
  normalizeRetrievalResponse,
} from '@/utils/knowledge-normalize'

describe('knowledge runtime normalization', () => {
  it('maps unknown document states to unknown instead of success', () => {
    const result = normalizeDocumentList({
      total: 1,
      documents: [
        {
          id: 'doc-1',
          filename: 'manual.pdf',
          status: 'completed-later',
          created_at: 1,
        },
      ],
    })
    expect(result?.documents[0]?.status).toBe('unknown')
  })

  it('drops raw reasoning and all unknown metadata at the SSE boundary', () => {
    const normalized = normalizePublicMetadata({
      contract_version: 2,
      history_persisted: false,
      route: 'rag',
      message_id: 'm-1',
      trace_id: 't-1',
      confidence: 0.8,
      reasoning: 'SECRET_REASONING_SENTINEL',
      intent_reasoning: 'SECRET_INTENT_SENTINEL',
      unexpected: 'SECRET_UNKNOWN_SENTINEL',
    })

    expect(normalized).toEqual({
      contract_version: 2,
      history_persisted: false,
      route: 'rag',
      message_id: 'm-1',
      trace_id: 't-1',
      confidence: 0.8,
    })
    expect(JSON.stringify(normalized)).not.toContain('SECRET')
  })

  it('keeps persistence and history completeness as explicit tri-state values', () => {
    expect(normalizePublicMetadata({ history_persisted: null })).toEqual({
      history_persisted: null,
    })
    expect(normalizePublicMetadata({ history_persisted: 'true' })).toEqual({})

    expect(
      normalizeChatHistory({
        contract_version: 2,
        session_id: 'session-v2',
        messages: [],
        total_messages: 0,
        complete: false,
        degraded: true,
        backend: 'fallback',
      }),
    ).toMatchObject({
      contract_version: 2,
      complete: false,
      degraded: true,
      backend: 'fallback',
    })
    expect(
      normalizeChatHistory({
        session_id: 'legacy-session',
        messages: [],
        total_messages: 0,
      }),
    ).toMatchObject({
      contract_version: null,
      complete: null,
      degraded: null,
      backend: 'unknown',
    })
  })

  it('normalizes done sources and applies source count/content bounds', () => {
    const event = normalizeKnowledgeStreamEvent({
      type: 'done',
      full_response: 'ok',
      sources: Array.from({ length: 60 }, (_, index) => ({
        source: `source-${index}`,
        content: 'x'.repeat(25_000),
      })),
      metadata: { route: 'rag', reasoning: 'never-store' },
    })
    expect(event?.type).toBe('done')
    if (event?.type !== 'done') throw new Error('expected done')
    expect(event.sources).toHaveLength(50)
    expect(event.sources[0]?.content).toHaveLength(20_000)
    expect(JSON.stringify(event.metadata)).not.toContain('never-store')
  })

  it('keeps ambiguous main zero while mapping invalid optional scores to null', () => {
    const response = normalizeRetrievalResponse({
      query: 'bearing',
      total: 1,
      retrieval_time_ms: 12,
      results: [
        {
          content: 'evidence',
          source: 'manual',
          score: 0,
          retrieval_score: 'not-a-number',
          rerank_score: null,
        },
      ],
    })
    expect(response?.results[0]).toMatchObject({
      score: 0,
      retrieval_score: null,
      rerank_score: null,
    })
  })

  it('rejects malformed top-level envelopes instead of inventing empty successes', () => {
    expect(normalizeDocumentList('<html>proxy error</html>')).toBeNull()
    expect(normalizeDocumentList({ documents: [] })).toBeNull()
    expect(normalizeRetrievalResponse({})).toBeNull()
    expect(normalizeChatHistory({ session_id: 'session-1' })).toBeNull()
  })

  it('rejects an empty or structurally incomplete done event', () => {
    expect(normalizeKnowledgeStreamEvent({ type: 'done' })).toBeNull()
    expect(
      normalizeKnowledgeStreamEvent({
        type: 'done',
        full_response: '   ',
        sources: [],
        metadata: {},
      }),
    ).toBeNull()
    expect(
      normalizeKnowledgeStreamEvent({
        type: 'done',
        full_response: 'answer',
        sources: 'not-an-array',
        metadata: {},
      }),
    ).toBeNull()
  })

  it.each(['token', 'done'])('rejects an oversized %s answer without echoing its body', (type) => {
    const payload = {
      type,
      content: type === 'token' ? 's'.repeat(200_001) : undefined,
      full_response: type === 'done' ? 's'.repeat(200_001) : undefined,
      sources: [],
      metadata: {},
    }

    expect(() => normalizeKnowledgeStreamEvent(payload)).toThrowError(KnowledgePayloadLimitError)
    try {
      normalizeKnowledgeStreamEvent(payload)
    } catch (error) {
      expect(String(error)).not.toContain('s'.repeat(100))
    }
  })
})
