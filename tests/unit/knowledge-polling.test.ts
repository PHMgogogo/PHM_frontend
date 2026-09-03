import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getDocumentList: vi.fn(),
  getDocumentDetail: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}))

vi.mock('@/api/document', () => api)
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import { useKnowledgeStore } from '@/stores/knowledge'

describe('knowledge document polling coordinator', () => {
  let store: ReturnType<typeof useKnowledgeStore>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    api.getDocumentList.mockResolvedValue({ documents: [], total: 0 })
    store = useKnowledgeStore()
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
  })

  function addOffPageProcessingUpload(): void {
    store.uploadQueue.push({
      localId: 'local-1',
      file: new File(['manual'], 'manual.pdf', { type: 'application/pdf' }),
      state: 'processing',
      documentId: 'doc-off-page',
    })
  }

  it('reconciles an off-page upload by detail id and stops after a terminal state', async () => {
    addOffPageProcessingUpload()
    api.getDocumentDetail.mockResolvedValue({
      id: 'doc-off-page',
      filename: 'manual.pdf',
      status: 'indexed',
      chunks: 7,
      created_at: 1,
      size_bytes: 6,
      file_hash: 'hash',
    })

    await store.init()
    await vi.advanceTimersByTimeAsync(3_000)

    expect(api.getDocumentDetail).toHaveBeenCalledWith(
      'doc-off-page',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(store.uploadQueue[0]).toMatchObject({
      state: 'indexed',
      message: '已索引 7 个分块',
    })

    const listCalls = api.getDocumentList.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getDocumentList).toHaveBeenCalledTimes(listCalls)
  })

  it('uses bounded backoff and ends persistent detail failures as tracking_error', async () => {
    addOffPageProcessingUpload()
    api.getDocumentDetail.mockRejectedValue(new Error('invalid detail response'))

    await store.init()
    for (const delay of [3_000, 6_000, 12_000, 24_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(delay)
    }

    expect(api.getDocumentDetail).toHaveBeenCalledTimes(5)
    expect(store.uploadQueue[0]).toMatchObject({
      state: 'tracking_error',
      message: '连续 5 次无法确认处理状态，请手动刷新',
    })
  })

  it('does not re-arm a poll after disposal during an in-flight request', async () => {
    addOffPageProcessingUpload()
    let resolveDetail: ((value: unknown) => void) | undefined
    api.getDocumentDetail.mockImplementation(
      () => new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )

    await store.init()
    const cycle = vi.advanceTimersByTimeAsync(3_000)
    await vi.waitFor(() => expect(api.getDocumentDetail).toHaveBeenCalledTimes(1))
    store.dispose()
    resolveDetail?.({
      id: 'doc-off-page',
      filename: 'manual.pdf',
      status: 'indexed',
      chunks: 1,
      created_at: 1,
      size_bytes: 1,
      file_hash: 'hash',
    })
    await cycle

    const listCalls = api.getDocumentList.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getDocumentList).toHaveBeenCalledTimes(listCalls)
  })
})
