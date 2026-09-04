import { describe, expect, it } from 'vitest'
import { resolveKnowledgeCapabilities } from '@/config/knowledge'

describe('knowledge mutation capabilities', () => {
  it('fails closed when every variable is absent', () => {
    expect(resolveKnowledgeCapabilities({})).toEqual({
      upload: false,
      deleteDocument: false,
      feedback: false,
      deleteRemoteSession: false,
    })
  })

  it('only accepts the exact string true', () => {
    expect(
      resolveKnowledgeCapabilities({
        VITE_RAG_UPLOAD_ENABLED: 'TRUE',
        VITE_RAG_DELETE_ENABLED: '1',
        VITE_RAG_FEEDBACK_ENABLED: 'true',
        VITE_RAG_SESSION_DELETE_ENABLED: ' true ',
      }),
    ).toEqual({
      upload: false,
      deleteDocument: false,
      feedback: true,
      deleteRemoteSession: false,
    })
  })
})
