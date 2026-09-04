import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentItem } from '@/api/document'

const api = vi.hoisted(() => ({
  getDocumentList: vi.fn(),
  getDocumentDetail: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}))
const messages = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/document', () => api)
vi.mock('@/config/knowledge', () => ({
  KNOWLEDGE_CAPABILITIES: {
    upload: true,
    deleteDocument: true,
    feedback: true,
    deleteRemoteSession: false,
  },
}))
vi.mock('element-plus', () => ({ ElMessage: messages }))

import { useKnowledgeStore } from '@/stores/knowledge'

function document(id: string, status: DocumentItem['status'] = 'indexed'): DocumentItem {
  return {
    id,
    filename: `${id}.pdf`,
    status,
    chunks: status === 'indexed' ? 1 : 0,
    created_at: 1,
    size_bytes: 1,
    file_hash: `hash-${id}`,
  }
}

describe('knowledge document recovery and pagination ownership', () => {
  let store: ReturnType<typeof useKnowledgeStore>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    setActivePinia(createPinia())
    store = useKnowledgeStore()
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
  })

  it('only commits the latest requested page when an older response arrives late', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    api.getDocumentList
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ documents: [document('page-2')], total: 21 })

    const initializing = store.init()
    await vi.waitFor(() => expect(api.getDocumentList).toHaveBeenCalledTimes(1))
    const switching = store.setPage(2)
    await vi.waitFor(() => expect(api.getDocumentList).toHaveBeenCalledTimes(2), { timeout: 500 })
    await switching

    expect(api.getDocumentList).toHaveBeenNthCalledWith(
      2,
      { skip: 20, limit: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(store.page).toBe(2)
    expect(store.documents.map((item) => item.id)).toEqual(['page-2'])

    resolveFirst?.({ documents: [document('page-1-late')], total: 21 })
    await initializing
    expect(store.page).toBe(2)
    expect(store.documents.map((item) => item.id)).toEqual(['page-2'])
  })

  it('keeps the prior page and data when a requested page fails', async () => {
    api.getDocumentList
      .mockResolvedValueOnce({ documents: [document('page-1')], total: 21 })
      .mockRejectedValueOnce(new Error('page two unavailable'))

    await store.init()
    await store.setPage(2)

    expect(store.page).toBe(1)
    expect(store.documents.map((item) => item.id)).toEqual(['page-1'])
    expect(store.stale).toBe(true)
    expect(store.listError).toContain('page two unavailable')
  })

  it('lets a polling refresh join the user-requested page instead of cancelling it', async () => {
    let resolvePageTwo: ((value: unknown) => void) | undefined
    api.getDocumentList
      .mockResolvedValueOnce({ documents: [document('processing', 'processing')], total: 21 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePageTwo = resolve
          }),
      )
      .mockResolvedValue({ documents: [document('old-page', 'processing')], total: 21 })

    await store.init()
    const switching = store.setPage(2)
    await vi.waitFor(() => expect(api.getDocumentList).toHaveBeenCalledTimes(2))

    await vi.advanceTimersByTimeAsync(3_000)
    expect(api.getDocumentList).toHaveBeenCalledTimes(2)

    resolvePageTwo?.({ documents: [document('page-2')], total: 21 })
    await switching
    expect(store.page).toBe(2)
    expect(store.documents.map((item) => item.id)).toEqual(['page-2'])
  })

  it('clamps an emptied last page after an accepted deletion', async () => {
    api.getDocumentList
      .mockResolvedValueOnce({ documents: [document('page-1')], total: 21 })
      .mockResolvedValueOnce({ documents: [document('last-item')], total: 21 })
      .mockResolvedValueOnce({ documents: [], total: 20 })
      .mockResolvedValueOnce({ documents: [document('page-1')], total: 20 })
    api.deleteDocument.mockResolvedValue({ status: 'success', message: 'accepted' })

    await store.init()
    await store.setPage(2)
    expect(await store.remove(document('last-item'))).toBe(true)

    expect(store.page).toBe(1)
    expect(store.documents.map((item) => item.id)).toEqual(['page-1'])
    expect(messages.success).toHaveBeenCalledWith('服务已接受删除请求，登记列表已刷新')
  })

  it('reports an accepted delete honestly when the follow-up refresh fails', async () => {
    const existing = document('existing')
    api.getDocumentList
      .mockResolvedValueOnce({ documents: [existing], total: 1 })
      .mockRejectedValueOnce(new Error('refresh unavailable'))
    api.deleteDocument.mockResolvedValue({ status: 'success', message: 'accepted' })

    await store.init()
    expect(await store.remove(existing)).toBe(true)

    expect(store.documents).toEqual([existing])
    expect(store.stale).toBe(true)
    expect(messages.success).not.toHaveBeenCalled()
    expect(messages.warning).toHaveBeenCalledWith(
      '服务已接受删除请求，但列表刷新失败；当前显示的是旧数据',
    )
  })

  it('never retries an already registered failed upload without deleting it first', async () => {
    api.getDocumentList.mockResolvedValue({ documents: [], total: 0 })
    api.uploadDocument.mockResolvedValue({
      id: 'registered-failure',
      filename: 'failed.pdf',
      status: 'processing',
      message: 'accepted',
    })
    api.getDocumentDetail.mockResolvedValue(document('registered-failure', 'failed'))

    await store.init()
    store.uploadFiles([new File(['failed'], 'failed.pdf', { type: 'application/pdf' })])
    await vi.waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(store.uploadQueue[0]).toMatchObject({
      state: 'failed',
      documentId: 'registered-failure',
    })

    store.retryUpload(store.uploadQueue[0])
    await Promise.resolve()
    expect(api.uploadDocument).toHaveBeenCalledTimes(1)
  })

  it('rechecks a tracking error by document id without uploading again', async () => {
    api.getDocumentList.mockResolvedValue({ documents: [], total: 0 })
    api.getDocumentDetail.mockResolvedValue(document('tracked', 'indexed'))
    await store.init()
    store.uploadQueue.push({
      localId: 'local-tracked',
      file: new File(['tracked'], 'tracked.pdf', { type: 'application/pdf' }),
      state: 'tracking_error',
      documentId: 'tracked',
      message: 'tracking unavailable',
    })

    expect(await store.recheckUpload(store.uploadQueue[0])).toBe(true)

    expect(api.getDocumentDetail).toHaveBeenCalledWith(
      'tracked',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(store.uploadQueue[0]).toMatchObject({ state: 'indexed' })
    expect(api.uploadDocument).not.toHaveBeenCalled()
  })
})
