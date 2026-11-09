<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { aircraftSourceText, isLocalSource } from '@/utils/aircraft-source'
import type { AircraftModel } from '@/types/entities'

const props = defineProps<{
  model: AircraftModel
}>()

const emit = defineEmits<{
  (e: 'delete', model: AircraftModel): void
}>()

const isLocal = computed(() => isLocalSource(props.model.source))
const sourceText = computed(() => aircraftSourceText(props.model))

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
      <span class="source-badge" :class="{ local: isLocal }">{{ sourceText }}</span>
    </div>
    <div class="card-body">
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
        <span class="info-value">{{ text(formatTime(model.createdAt)) }}</span>
      </div>
    </div>
    <div v-if="isLocal" class="card-footer">
      <el-button
        class="delete-btn"
        type="danger"
        text
        size="small"
        :icon="Delete"
        @click="emit('delete', model)"
      >
        删除
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.model-card {
  background: #ffffff;
  border-radius: var(--phm-radius-card);
  box-shadow: var(--phm-shadow-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--phm-border);
  transition: border-color var(--phm-transition), box-shadow var(--phm-transition), transform var(--phm-transition);
  height: 100%;
}

.model-card:hover {
  border-color: #c6ddd7;
  box-shadow: var(--phm-shadow-hover);
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
  font-weight: 650;
  color: var(--phm-text);
  word-break: break-all;
}

.source-badge {
  flex-shrink: 0;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--phm-text-secondary);
  background: #f1f4f3;
}

.source-badge.local {
  color: var(--phm-primary-700);
  background: var(--phm-primary-50);
  border: 1px solid #cfe5df;
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
  color: var(--phm-text-muted);
  min-width: 56px;
  flex-shrink: 0;
}

.info-value {
  color: #40504e;
  font-weight: 500;
  word-break: break-all;
}

.desc {
  font-weight: 400;
  color: var(--phm-text-secondary);
  line-height: 1.5;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--phm-border);
  margin-top: auto;
}

.delete-btn {
  padding-right: 0;
}
</style>
