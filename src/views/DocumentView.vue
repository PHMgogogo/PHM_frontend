<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Search, Delete, Upload, Document, Download, Grid } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { useKnowledgeStore } from '@/stores/knowledge'
import type { DocumentItem } from '@/api/document'

const store = useKnowledgeStore()
const searchQuery = ref('')

// ---- 轮询文档列表 ----
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

async function pollDocuments() {
  if (polling) return
  polling = true
  try {
    await store.fetchDocuments()
  } finally {
    polling = false
  }
}

onMounted(() => {
  store.init()
  pollTimer = setInterval(pollDocuments, 3000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

const filteredDocuments = computed(() => {
  if (!searchQuery.value) return store.documents
  const query = searchQuery.value.toLowerCase()
  return store.documents.filter((doc) =>
    doc.filename?.toLowerCase().includes(query),
  )
})

function handleFileChange(file: UploadFile) {
  if (file.raw) {
    store.upload(file.raw)
  }
}

async function handleDelete(doc: DocumentItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除文档「${doc.filename}」？此操作不可撤销。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await store.remove(doc.id)
  } catch {
    // 用户取消
  }
}

function getFileType(filename: string): string {
  const ext = filename?.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md') return 'md'
  if (ext === 'pdf') return 'pdf'
  return 'txt'
}

function getFileTypeLabel(filename: string): string {
  const ext = filename?.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md') return 'MD'
  if (ext === 'pdf') return 'PDF'
  return ext.toUpperCase().slice(0, 3) || 'TXT'
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusText(status: string): string {
  return status === 'completed' ? '已完成' : '处理中'
}

function getStatusType(status: string): 'success' | 'warning' {
  return status === 'completed' ? 'success' : 'warning'
}
</script>

<template>
  <div class="page-inner">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <h2 class="page-title">知识库管理</h2>
        <p class="page-subtitle">上传和管理知识库文档，支持 Markdown、文本和 PDF 格式</p>
      </div>
      <div class="header-actions">
        <el-upload
        drag
        multiple
        accept=".md,.txt,.pdf"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileChange"
        class="upload-area"
        >
          <div class="upload-inner">
            <span class="upload-icon-emoji"><el-icon color="#2563EB"><Upload /></el-icon></span>
            <span class="upload-text">拖拽或点击上传</span>
            <div class="upload-formats">
              <el-tag size="small" type="info">.md</el-tag>
              <el-tag size="small" type="info">.txt</el-tag>
              <el-tag size="small" type="info">.pdf</el-tag>
            </div>
          </div>
        </el-upload>
        <div class="stat-item">
          <span class="stat-value">{{ store.documents.length }}</span>
          <span class="stat-label">文档总数</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ store.totalChunks }}</span>
          <span class="stat-label">分块数量</span>
        </div>
      </div>
    </div>
    
    <!-- Document Section -->
    <div class="document-section">
      <div class="section-header">
        <h3 class="section-title">已上传文档</h3>
        <el-input
          v-model="searchQuery"
          placeholder="搜索文档..."
          :prefix-icon="Search"
          clearable
          class="search-input"
        />
      </div>

      <!-- Empty State -->
      <div v-if="filteredDocuments.length === 0" class="empty-state">
        <span class="empty-icon"><el-icon color="#64748B"><Document /></el-icon></span>
        <h3>暂无文档</h3>
        <p>上传文档以开始构建知识库</p>
      </div>

      <!-- Document Grid -->
      <div v-else class="document-grid">
        <div
          v-for="doc in filteredDocuments"
          :key="doc.id"
          class="document-card"
        >
          <div class="doc-header">
            <div class="doc-type-icon" :class="'type-' + getFileType(doc.filename)">
              {{ getFileTypeLabel(doc.filename) }}
            </div>
            <el-button
              type="danger"
              text
              circle
              size="small"
              :icon="Delete"
              @click.stop="handleDelete(doc)"
              title="删除"
            />
          </div>
          <div class="doc-body">
            <h4 class="doc-name">{{ doc.filename }}</h4>
            <div class="doc-meta">
              <span class="meta-item">
                <span class="meta-icon"><el-icon color="#10B981"><Download /></el-icon></span>
                {{ formatSize(doc.size_bytes) }}
              </span>
              <span class="meta-item">
                <span class="meta-icon"><el-icon color="#64748B"><Grid /></el-icon></span>
                {{ doc.chunks || 0 }} 分块
              </span>
            </div>
          </div>
          <div class="doc-footer">
            <el-tag
              :type="getStatusType(doc.status)"
              size="small"
              effect="plain"
            >
              {{ getStatusText(doc.status) }}
            </el-tag>
            <span class="upload-time">{{ formatDate(doc.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-inner {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---- Page Header ---- */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-content {
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: #8c9ab0;
  margin: 4px 0 0;
}

.header-actions {
  display: flex;
  align-items: stretch;
  gap: 20px;
  flex-shrink: 0;
}

.stat-item {
  text-align: center;
  padding: 20px 32px;
  background: #ffffff;
  border-radius: 10px;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}

.stat-value {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #1a6cf0;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #8c9ab0;
  margin-top: 6px;
}

/* ---- Upload Area ---- */
.upload-area {
  flex-shrink: 0;
}

.upload-area :deep(.el-upload-dragger) {
  border: 2px dashed #e0e8f5;
  border-radius: 10px;
  padding: 20px 24px;
  background: #ffffff;
  transition: all 0.2s;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.upload-area :deep(.el-upload-dragger:hover) {
  border-color: #1a6cf0;
  background: #f0f5ff;
}

.upload-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.upload-icon-emoji {
  font-size: 22px;
}

.upload-text {
  font-size: 13px;
  font-weight: 500;
  color: #0d1f3c;
}

.upload-formats {
  display: flex;
  gap: 6px;
}

/* ---- Document Section ---- */
.document-section {
  background: #ffffff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(26, 108, 240, 0.08);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #3a4a5c;
  margin: 0;
}

.search-input {
  width: 240px;
}

/* ---- Empty State ---- */
.empty-state {
  text-align: center;
  padding: 48px 0;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
  display: block;
  margin-bottom: 12px;
}

.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: #8c9ab0;
  margin: 0 0 8px;
}

.empty-state p {
  font-size: 14px;
  color: #bcc5d0;
  margin: 0;
}

/* ---- Document Grid ---- */
.document-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.document-card {
  background: #fafbfc;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e0e8f5;
  transition: all 0.2s;
}

.document-card:hover {
  border-color: #d4e3fb;
  box-shadow: 0 6px 24px rgba(26, 108, 240, 0.18);
}

.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.doc-type-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.doc-type-icon.type-md {
  background: #f0f5ff;
  color: #1a6cf0;
}

.doc-type-icon.type-pdf {
  background: #fef0f0;
  color: #e74c3c;
}

.doc-type-icon.type-txt {
  background: #f0f3f8;
  color: #8c9ab0;
}

.doc-body {
  margin-bottom: 8px;
}

.doc-name {
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
  margin: 0 0 8px;
  word-break: break-word;
  line-height: 1.4;
}

.doc-meta {
  display: flex;
  gap: 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8c9ab0;
}

.meta-icon {
  font-size: 12px;
  opacity: 0.7;
}

.doc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #e0e8f5;
}

.upload-time {
  font-size: 11px;
  color: #8c9ab0;
}

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .stat-item {
    flex: 1;
  }

  .upload-area {
    width: 100%;
  }

  .section-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .search-input {
    width: 100%;
  }

  .document-grid {
    grid-template-columns: 1fr;
  }
}
</style>
