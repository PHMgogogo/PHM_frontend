<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox, type UploadFile } from 'element-plus'
import { Delete, Document, Refresh, Search, UploadFilled } from '@element-plus/icons-vue'
import { useKnowledgeStore, type UploadQueueItem } from '@/stores/knowledge'
import type { DocumentItem } from '@/api/document'
import { canDeleteDocument, documentStatusPresentation } from '@/utils/knowledge-format'

const store = useKnowledgeStore()
const searchQuery = ref('')

const filteredDocuments = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return store.documents
  return store.documents.filter((document) => document.filename.toLowerCase().includes(query))
})

function handleFileChange(file: UploadFile): void {
  if (file.raw) store.uploadFiles([file.raw])
}

async function handleDelete(document: DocumentItem): Promise<void> {
  if (!canDeleteDocument(document.status, store.capabilities.deleteDocument)) return
  try {
    await ElMessageBox.confirm(
      `确定向服务请求删除「${document.filename}」？当前接口只能确认服务接受请求，不能证明所有索引已完成清理。`,
      '确认删除请求',
      {
        confirmButtonText: '提交删除请求',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await store.remove(document)
  } catch {
    // 用户取消确认。
  }
}

function status(document: DocumentItem) {
  return documentStatusPresentation(document.status)
}

function fileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase().slice(0, 5) || 'FILE'
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '时间未提供'
  return new Date(timestamp * 1_000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function queueLabel(item: UploadQueueItem): string {
  const labels: Record<UploadQueueItem['state'], string> = {
    queued: '等待上传',
    uploading: '正在上传',
    processing: '后台处理中',
    indexed: '已索引',
    duplicate: '已存在',
    failed: '失败',
    tracking_error: '跟踪异常',
    invalid: '文件不符合要求',
  }
  return labels[item.state]
}

function queueTone(item: UploadQueueItem): 'success' | 'warning' | 'danger' | 'info' {
  if (item.state === 'indexed') return 'success'
  if (item.state === 'failed' || item.state === 'tracking_error' || item.state === 'invalid') {
    return 'danger'
  }
  if (item.state === 'duplicate') return 'info'
  return 'warning'
}
</script>

<template>
  <section class="library" aria-labelledby="document-library-title">
    <div class="stats-grid">
      <article class="stat-card accent">
        <span class="stat-label">文档总数</span>
        <strong>{{ store.serverTotal }}</strong>
        <span class="stat-help">由服务端统计</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">当前页分块</span>
        <strong>{{ store.totalChunks }}</strong>
        <span class="stat-help">不代表全库总量</span>
      </article>
      <article class="stat-card warning">
        <span class="stat-label">处理中</span>
        <strong>{{ store.processingCount }}</strong>
        <span class="stat-help">仅有任务时轮询</span>
      </article>
      <article class="stat-card danger">
        <span class="stat-label">处理失败</span>
        <strong>{{ store.failedCount }}</strong>
        <span class="stat-help">尚不可检索</span>
      </article>
    </div>

    <el-alert
      v-if="!store.capabilities.upload"
      class="readonly-alert"
      title="当前知识库为只读模式"
      description="部署尚未启用经认证授权的文档写入能力；你仍可检查文档状态、验证检索并使用知识库 Agent。"
      type="info"
      :closable="false"
      show-icon
    />

    <div v-if="store.capabilities.upload" class="upload-panel">
      <el-upload
        drag
        multiple
        accept=".md,.txt,.pdf,.docx,.pptx,.html,.htm"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileChange"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-title">拖拽或点击选择资料</div>
        <div class="upload-hint">MD / TXT / PDF / DOCX / PPTX / HTML，单文件不超过 50 MiB</div>
      </el-upload>
    </div>

    <div v-if="store.uploadQueue.length" class="queue-panel" data-testid="upload-queue">
      <div class="section-heading">
        <div>
          <h3>摄入队列</h3>
          <p>上传完成后仍需等待后台建立索引。</p>
        </div>
      </div>
      <div class="queue-list">
        <div v-for="item in store.uploadQueue" :key="item.localId" class="queue-item">
          <div class="queue-main">
            <strong>{{ item.file.name }}</strong>
            <span>{{ formatSize(item.file.size) }}</span>
          </div>
          <el-tag :type="queueTone(item)" effect="plain">{{ queueLabel(item) }}</el-tag>
          <span class="queue-message">{{ item.message }}</span>
          <div class="queue-actions">
            <el-button
              v-if="['failed', 'tracking_error'].includes(item.state)"
              text
              type="primary"
              @click="store.retryUpload(item)"
            >
              重试上传
            </el-button>
            <el-button
              v-if="!['uploading', 'processing'].includes(item.state)"
              text
              @click="store.dismissUpload(item.localId)"
            >
              移除记录
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="document-panel">
      <div class="section-heading responsive-heading">
        <div>
          <h3 id="document-library-title">文档列表</h3>
          <p>搜索仅作用于当前页；列表错误时保留上一次结果并标为旧数据。</p>
        </div>
        <div class="list-tools">
          <el-input
            v-model="searchQuery"
            class="search-input"
            placeholder="搜索当前页文档"
            :prefix-icon="Search"
            clearable
          />
          <el-button :icon="Refresh" :loading="store.loading" @click="store.fetchDocuments">
            刷新
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="store.listError"
        :title="store.listError"
        :description="store.stale ? '下方内容是上一次成功加载的数据。' : undefined"
        type="error"
        :closable="false"
        show-icon
      />

      <el-empty v-if="!store.loading && filteredDocuments.length === 0" description="当前页暂无文档">
        <template #image>
          <el-icon class="empty-icon"><Document /></el-icon>
        </template>
      </el-empty>

      <div v-else class="document-grid" :class="{ stale: store.stale }">
        <article v-for="document in filteredDocuments" :key="document.id" class="document-card">
          <div class="document-card-header">
            <span class="file-type">{{ fileExtension(document.filename) }}</span>
            <el-tooltip
              v-if="store.capabilities.deleteDocument"
              :content="
                document.status === 'processing'
                  ? '处理期间不能安全删除，请等待服务进入终态'
                  : document.status === 'unknown'
                    ? '未知状态不能删除'
                    : '向服务提交删除请求'
              "
            >
              <span>
                <el-button
                  circle
                  text
                  type="danger"
                  :icon="Delete"
                  :disabled="!canDeleteDocument(document.status, store.capabilities.deleteDocument)"
                  :aria-label="`删除 ${document.filename}`"
                  @click="handleDelete(document)"
                />
              </span>
            </el-tooltip>
          </div>
          <h4 :title="document.filename">{{ document.filename }}</h4>
          <div class="document-meta">
            <span>{{ formatSize(document.size_bytes) }}</span>
            <span>{{ document.chunks }} 分块</span>
            <span>{{ formatDate(document.created_at) }}</span>
          </div>
          <div class="document-status">
            <el-tag :type="status(document).tone" effect="plain">
              {{ status(document).label }}
            </el-tag>
            <span>{{ status(document).description }}</span>
          </div>
          <p v-if="document.status === 'failed'" class="recovery-hint">
            当前资料未进入可检索状态。安全删除能力开启后可请求删除并重新上传，否则请联系运维。
          </p>
          <p v-if="document.status === 'processing'" class="recovery-hint">
            正在后台处理，当前不能安全删除。
          </p>
        </article>
      </div>

      <el-pagination
        v-if="store.serverTotal > store.pageSize"
        class="pagination"
        background
        layout="prev, pager, next"
        :current-page="store.page"
        :page-size="store.pageSize"
        :total="store.serverTotal"
        @current-change="store.setPage"
      />
    </div>
  </section>
</template>

<style scoped>
.library { display: flex; flex-direction: column; gap: 18px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.stat-card { background: #fff; border: 1px solid #e7ecf4; border-radius: 14px; padding: 18px; display: grid; gap: 5px; box-shadow: 0 8px 24px rgba(13, 31, 60, .04); }
.stat-card strong { color: #14294a; font-size: 28px; line-height: 1.1; }
.stat-card.accent strong { color: #1a6cf0; }
.stat-card.warning strong { color: #d48806; }
.stat-card.danger strong { color: #cf3f48; }
.stat-label { color: #5d6b82; font-size: 13px; font-weight: 600; }
.stat-help { color: #9aa6b8; font-size: 12px; }
.readonly-alert, .upload-panel, .queue-panel, .document-panel { border-radius: 14px; }
.upload-panel, .queue-panel, .document-panel { background: #fff; border: 1px solid #e7ecf4; padding: 20px; box-shadow: 0 8px 24px rgba(13, 31, 60, .04); }
.upload-icon { color: #1a6cf0; font-size: 34px; margin-bottom: 8px; }
.upload-title { color: #14294a; font-weight: 700; }
.upload-hint { color: #7c899d; font-size: 12px; margin-top: 5px; }
.section-heading { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 16px; }
.section-heading h3 { color: #14294a; font-size: 16px; margin: 0; }
.section-heading p { color: #8793a7; font-size: 12px; margin: 4px 0 0; }
.queue-list { display: grid; gap: 10px; }
.queue-item { display: grid; grid-template-columns: minmax(180px, 1fr) auto minmax(160px, 1fr) auto; align-items: center; gap: 12px; border: 1px solid #edf0f5; border-radius: 10px; padding: 12px 14px; }
.queue-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.queue-main strong { color: #233653; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-main span, .queue-message { color: #8793a7; font-size: 12px; }
.queue-actions { white-space: nowrap; }
.list-tools { display: flex; gap: 10px; }
.search-input { width: 260px; }
.document-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin-top: 16px; }
.document-grid.stale { opacity: .72; }
.document-card { border: 1px solid #e7ecf4; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; transition: border-color .2s, transform .2s; }
.document-card:hover { border-color: #b8cef7; transform: translateY(-1px); }
.document-card-header { display: flex; align-items: center; justify-content: space-between; }
.file-type { display: inline-grid; place-items: center; min-width: 42px; height: 28px; padding: 0 8px; border-radius: 8px; color: #1a6cf0; background: #edf4ff; font-size: 11px; font-weight: 800; }
.document-card h4 { color: #14294a; font-size: 14px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: #8491a5; font-size: 12px; }
.document-status { display: flex; align-items: center; gap: 9px; color: #78869b; font-size: 12px; }
.recovery-hint { color: #8a5a15; background: #fff8e8; border-radius: 8px; font-size: 12px; line-height: 1.55; margin: 0; padding: 9px 10px; }
.pagination { justify-content: flex-end; margin-top: 18px; }
.empty-icon { font-size: 48px; color: #a6b2c4; }
@media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } .queue-item { grid-template-columns: 1fr auto; } .queue-message { grid-column: 1 / -1; } }
@media (max-width: 680px) { .stats-grid { grid-template-columns: 1fr 1fr; } .responsive-heading { align-items: stretch; flex-direction: column; } .list-tools { width: 100%; } .search-input { flex: 1; width: auto; } .document-grid { grid-template-columns: 1fr; } .queue-item { grid-template-columns: 1fr; } }
</style>
