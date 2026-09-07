<script setup lang="ts">
import { sourceText } from '@/api/unified'
import type { UnifiedModelRow } from '@/types/entities'

defineProps<{
  model: UnifiedModelRow
}>()

function formatTime(dateStr?: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** 空值用 * 占位展示 */
function text(v?: string | null) {
  return v && v.trim() ? v : '*'
}
</script>

<template>
  <div class="model-card">
    <div class="card-header">
      <span class="model-name">{{ model.modelCode }}</span>
    </div>
    <div class="card-body">
      <div class="info-row">
        <span class="info-label">来源</span>
        <span class="info-value source">{{ text(sourceText(model.source)) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">生产厂商</span>
        <span class="info-value">{{ text(model.manufacturer) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">描述</span>
        <span class="info-value desc">{{ text(model.description) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">创建时间</span>
        <span class="info-value">{{ text(formatTime(model.createdTime)) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(26, 108, 240, 0.08);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #e8edf5;
  transition: box-shadow 0.2s, transform 0.2s;
}

.model-card:hover {
  box-shadow: 0 6px 24px rgba(26, 108, 240, 0.18);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-name {
  font-size: 16px;
  font-weight: 700;
  color: #0d1f3c;
  word-break: break-all;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: #8c9ab0;
  min-width: 56px;
  flex-shrink: 0;
}

.info-value {
  color: #3a4a5c;
  font-weight: 500;
  word-break: break-all;
}

.source {
  color: #1a6cf0;
}

.desc {
  font-weight: 400;
  color: #5a6a7c;
  line-height: 1.5;
}
</style>
