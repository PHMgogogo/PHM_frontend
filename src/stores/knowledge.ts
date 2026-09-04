import { computed, markRaw, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  deleteDocument,
  getDocumentDetail,
  getDocumentList,
  uploadDocument,
  type DocumentItem,
} from '@/api/document'
import { ApiError } from '@/api/client'
import { KNOWLEDGE_CAPABILITIES } from '@/config/knowledge'
import { canDeleteDocument } from '@/utils/knowledge-format'

export type UploadQueueState =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'indexed'
  | 'duplicate'
  | 'failed'
  | 'tracking_error'
  | 'invalid'

export interface UploadQueueItem {
  localId: string
  file: File
  state: UploadQueueState
  documentId?: string
  message?: string
}

interface ActiveListRequest {
  id: number
  targetPage: number
  controller: AbortController
  scheduleAfter: boolean
  promise: Promise<boolean>
}

const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'pdf', 'docx', 'pptx', 'html', 'htm'])
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const POLL_DELAYS = [3_000, 6_000, 12_000, 24_000, 30_000] as const
const DETAIL_FAILURE_LIMIT = 5

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error && error.message ? error.message : '未知错误'
}

function localId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random()}`
}

function validateFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!SUPPORTED_EXTENSIONS.has(extension)) return `不支持 .${extension || '未知'} 文件`
  if (file.size > MAX_UPLOAD_BYTES) return '文件超过 50 MiB 限制'
  return null
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const documents = ref<DocumentItem[]>([])
  const serverTotal = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const listError = ref('')
  const stale = ref(false)
  const uploadQueue = ref<UploadQueueItem[]>([])
  const uploadRunning = ref(false)

  let generation = 0
  let disposed = true
  let lifecycleController = new AbortController()
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let activeListRequest: ActiveListRequest | null = null
  let listRequestId = 0
  let pollInFlight = false
  let failureIndex = 0
  const detailFailures = new Map<string, number>()

  const totalChunks = computed(() =>
    documents.value.reduce((sum, document) => sum + document.chunks, 0),
  )
  const processingCount = computed(
    () => documents.value.filter((document) => document.status === 'processing').length,
  )
  const failedCount = computed(
    () => documents.value.filter((document) => document.status === 'failed').length,
  )
  const hasProcessing = computed(
    () =>
      documents.value.some((document) => document.status === 'processing') ||
      uploadQueue.value.some((item) => item.state === 'processing'),
  )

  function clearPollTimer(): void {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  function schedulePoll(): void {
    clearPollTimer()
    if (disposed || !hasProcessing.value) return
    const owner = generation
    const delay = POLL_DELAYS[Math.min(failureIndex, POLL_DELAYS.length - 1)]
    pollTimer = setTimeout(() => {
      if (owner !== generation || disposed) return
      void pollCycle(owner)
    }, delay)
  }

  function fetchDocumentsInternal(
    scheduleAfter = true,
    requestedPage = page.value,
  ): Promise<boolean> {
    const targetPage = Math.max(1, Math.floor(requestedPage))
    if (activeListRequest?.targetPage === targetPage) {
      activeListRequest.scheduleAfter ||= scheduleAfter
      return activeListRequest.promise
    }

    activeListRequest?.controller.abort()
    const owner = generation
    const requestId = ++listRequestId
    const controller = new AbortController()
    loading.value = true
    const promise = (async () => {
      try {
        const response = await getDocumentList(
          { skip: (targetPage - 1) * pageSize.value, limit: pageSize.value },
          { signal: controller.signal },
        )
        if (
          owner !== generation ||
          disposed ||
          activeListRequest?.id !== requestId
        ) {
          return false
        }
        const lastPage = Math.max(1, Math.ceil(response.total / pageSize.value))
        if (targetPage > lastPage) {
          serverTotal.value = response.total
          return fetchDocumentsInternal(scheduleAfter, lastPage)
        }
        documents.value = response.documents
        serverTotal.value = response.total
        page.value = targetPage
        listError.value = ''
        stale.value = false
        return true
      } catch (error) {
        if (
          owner !== generation ||
          disposed ||
          activeListRequest?.id !== requestId
        ) {
          return false
        }
        if (!(error instanceof ApiError && error.kind === 'cancelled')) {
          listError.value = `知识库服务不可达：${errorMessage(error)}`
          stale.value = documents.value.length > 0
        }
        return false
      }
    })().finally(() => {
      if (owner !== generation || activeListRequest?.id !== requestId) return
      const shouldSchedule = activeListRequest.scheduleAfter
      activeListRequest = null
      loading.value = false
      if (shouldSchedule && !disposed) schedulePoll()
    })
    activeListRequest = {
      id: requestId,
      targetPage,
      controller,
      scheduleAfter,
      promise,
    }
    return promise
  }

  async function reconcileProcessingQueue(owner: number): Promise<boolean> {
    let success = true
    const ids = uploadQueue.value
      .filter((item) => item.state === 'processing' && item.documentId)
      .map((item) => item.documentId as string)

    for (const documentId of ids) {
      if (owner !== generation || disposed) return false
      try {
        const detail = await getDocumentDetail(documentId, { signal: lifecycleController.signal })
        if (owner !== generation || disposed) return false
        detailFailures.delete(documentId)
        const item = uploadQueue.value.find((candidate) => candidate.documentId === documentId)
        if (!item || item.state !== 'processing') continue
        if (detail.status === 'indexed' || detail.status === 'failed') {
          item.state = detail.status
          item.message =
            detail.status === 'indexed'
              ? `已索引 ${detail.chunks} 个分块`
              : KNOWLEDGE_CAPABILITIES.deleteDocument
                ? '后台处理失败，请确认删除登记后重传'
                : '后台处理失败，请联系运维处理'
        } else if (detail.status === 'unknown') {
          item.state = 'tracking_error'
          item.message = '服务返回未知状态，请手动刷新'
          success = false
        }
      } catch (error) {
        if (owner !== generation || disposed) return false
        const item = uploadQueue.value.find((candidate) => candidate.documentId === documentId)
        if (error instanceof ApiError && error.status === 404 && item) {
          detailFailures.delete(documentId)
          item.state = 'tracking_error'
          item.message = '服务找不到该处理任务，请联系运维'
        } else if (!(error instanceof ApiError && error.kind === 'cancelled')) {
          success = false
          const failures = (detailFailures.get(documentId) ?? 0) + 1
          detailFailures.set(documentId, failures)
          if (item && failures >= DETAIL_FAILURE_LIMIT) {
            detailFailures.delete(documentId)
            item.state = 'tracking_error'
            item.message = `连续 ${DETAIL_FAILURE_LIMIT} 次无法确认处理状态，请手动刷新`
          }
        }
      }
    }
    return success
  }

  async function pollCycle(owner: number): Promise<void> {
    if (pollInFlight || owner !== generation || disposed) return
    pollInFlight = true
    pollTimer = null
    try {
      const targetPage = activeListRequest?.targetPage ?? page.value
      const listSucceeded = await fetchDocumentsInternal(false, targetPage)
      const detailSucceeded = await reconcileProcessingQueue(owner)
      if (owner !== generation || disposed) return
      if (listSucceeded && detailSucceeded) failureIndex = 0
      else failureIndex = Math.min(failureIndex + 1, POLL_DELAYS.length - 1)
    } finally {
      pollInFlight = false
      if (owner === generation && !disposed) schedulePoll()
    }
  }

  async function fetchDocuments(): Promise<boolean> {
    return fetchDocumentsInternal(true)
  }

  async function processUploadQueue(owner: number): Promise<void> {
    if (uploadRunning.value) return
    uploadRunning.value = true
    try {
      while (owner === generation && !disposed) {
        const item = uploadQueue.value.find((candidate) => candidate.state === 'queued')
        if (!item) break
        item.state = 'uploading'
        try {
          const response = await uploadDocument(item.file, { signal: lifecycleController.signal })
          if (owner !== generation || disposed) return
          item.documentId = response.id
          item.state = 'processing'
          item.message = '上传完成，等待后台建立索引'
          await fetchDocumentsInternal(false)
        } catch (error) {
          if (owner !== generation || disposed) return
          if (error instanceof ApiError && error.status === 409) {
            item.state = 'duplicate'
            item.message = error.message || '文件已存在'
          } else if (error instanceof ApiError && error.kind === 'cancelled') {
            item.state = 'queued'
            return
          } else {
            item.state = 'failed'
            item.message = errorMessage(error)
          }
        }
      }
    } finally {
      if (owner === generation) uploadRunning.value = false
      if (owner === generation && !disposed) schedulePoll()
    }
  }

  function uploadFiles(files: File[]): void {
    if (!KNOWLEDGE_CAPABILITIES.upload) {
      ElMessage.warning('当前部署为只读模式，未启用文档上传')
      return
    }
    for (const file of files) {
      const validationError = validateFile(file)
      uploadQueue.value.push({
        localId: localId(),
        file: markRaw(file),
        state: validationError ? 'invalid' : 'queued',
        message: validationError ?? undefined,
      })
    }
    void processUploadQueue(generation)
  }

  function retryUpload(item: UploadQueueItem): void {
    if (!KNOWLEDGE_CAPABILITIES.upload || disposed) return
    if (item.state !== 'failed' || item.documentId) return
    item.message = undefined
    item.state = 'queued'
    void processUploadQueue(generation)
  }

  async function recheckUpload(item: UploadQueueItem): Promise<boolean> {
    if (disposed || item.state !== 'tracking_error' || !item.documentId) return false
    detailFailures.delete(item.documentId)
    item.state = 'processing'
    item.message = '正在重新检查服务端状态'
    await pollCycle(generation)
    return true
  }

  async function deleteAndRetryUpload(item: UploadQueueItem): Promise<boolean> {
    if (
      disposed ||
      !KNOWLEDGE_CAPABILITIES.upload ||
      !KNOWLEDGE_CAPABILITIES.deleteDocument ||
      item.state !== 'failed' ||
      !item.documentId
    ) {
      return false
    }
    const owner = generation
    const documentId = item.documentId
    try {
      await deleteDocument(documentId, { signal: lifecycleController.signal })
      if (owner !== generation || disposed) return false
      detailFailures.delete(documentId)
      item.documentId = undefined
      item.message = '原登记已请求删除，准备重新上传'
      item.state = 'queued'
      void processUploadQueue(owner)
      return true
    } catch (error) {
      if (!(error instanceof ApiError && error.kind === 'cancelled')) {
        ElMessage.error(`删除后重传失败：${errorMessage(error)}`)
      }
      return false
    }
  }

  function dismissUpload(localIdentifier: string): void {
    const item = uploadQueue.value.find((candidate) => candidate.localId === localIdentifier)
    if (item?.documentId) detailFailures.delete(item.documentId)
    uploadQueue.value = uploadQueue.value.filter((item) => item.localId !== localIdentifier)
    schedulePoll()
  }

  async function remove(document: DocumentItem): Promise<boolean> {
    if (!canDeleteDocument(document.status, KNOWLEDGE_CAPABILITIES.deleteDocument)) return false
    try {
      await deleteDocument(document.id, { signal: lifecycleController.signal })
      const refreshed = await fetchDocumentsInternal(false)
      if (refreshed) {
        ElMessage.success('服务已接受删除请求，登记列表已刷新')
      } else {
        ElMessage.warning('服务已接受删除请求，但列表刷新失败；当前显示的是旧数据')
      }
      return true
    } catch (error) {
      if (!(error instanceof ApiError && error.kind === 'cancelled')) {
        ElMessage.error(`删除请求失败：${errorMessage(error)}`)
      }
      return false
    } finally {
      schedulePoll()
    }
  }

  async function setPage(nextPage: number): Promise<void> {
    await fetchDocumentsInternal(true, nextPage)
  }

  async function init(): Promise<void> {
    if (!disposed) return
    disposed = false
    generation += 1
    failureIndex = 0
    detailFailures.clear()
    lifecycleController = new AbortController()
    await fetchDocuments()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    generation += 1
    clearPollTimer()
    lifecycleController.abort()
    activeListRequest?.controller.abort()
    activeListRequest = null
    listRequestId += 1
    loading.value = false
    pollInFlight = false
    uploadRunning.value = false
    detailFailures.clear()
  }

  return {
    capabilities: KNOWLEDGE_CAPABILITIES,
    documents,
    serverTotal,
    page,
    pageSize,
    loading,
    listError,
    stale,
    uploadQueue,
    uploadRunning,
    totalChunks,
    processingCount,
    failedCount,
    hasProcessing,
    fetchDocuments,
    uploadFiles,
    retryUpload,
    recheckUpload,
    deleteAndRetryUpload,
    dismissUpload,
    remove,
    setPage,
    init,
    dispose,
  }
})
