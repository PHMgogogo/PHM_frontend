import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getDocumentList, uploadDocument, deleteDocument } from '@/api/document'
import type { DocumentItem } from '@/api/document'

/** 友好错误信息 */
function friendlyError(e: unknown): string {
  if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
    return '服务不可达，请确认后端服务已启动'
  }
  return (e as Error).message || '未知错误'
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ---- 状态 ----
  const documents = ref<DocumentItem[]>([])
  const loading = ref(false)
  const uploading = ref(false)

  // ---- 计算属性 ----

  const totalChunks = computed(() =>
    documents.value.reduce((sum, doc) => sum + (doc.chunks || 0), 0),
  )

  // ---- 操作 ----

  /** 获取文档列表 */
  async function fetchDocuments() {
    loading.value = true
    try {
      const res = await getDocumentList()
      documents.value = res.documents || []
    } catch (e) {
      ElMessage.error('加载文档列表失败: ' + friendlyError(e))
    } finally {
      loading.value = false
    }
  }

  /** 上传文档 */
  async function upload(file: File): Promise<boolean> {
    uploading.value = true
    try {
      const res = await uploadDocument(file)
      if (res.status === 'duplicate') {
        ElMessage.warning(`${file.name} ${res.message || '文件已存在'}`)
      } else {
        ElMessage.success(`${file.name} 上传成功`)
      }
      await fetchDocuments()
      return true
    } catch (e) {
      ElMessage.error(`${file.name} 上传失败: ${friendlyError(e)}`)
      return false
    } finally {
      uploading.value = false
    }
  }

  /** 删除文档 */
  async function remove(docId: string) {
    try {
      await deleteDocument(docId)
      documents.value = documents.value.filter((d) => d.id !== docId)
      ElMessage.success('文档已删除')
    } catch (e) {
      ElMessage.error('删除失败: ' + friendlyError(e))
    }
  }

  // ---- 初始化 ----

  function init() {
    fetchDocuments()
  }

  return {
    documents,
    loading,
    uploading,
    totalChunks,
    fetchDocuments,
    upload,
    remove,
    init,
  }
})
