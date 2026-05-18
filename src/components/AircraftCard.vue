<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Aircraft } from '@/stores/aircraft'

const props = defineProps<{
  aircraft: Aircraft
}>()

const router = useRouter()

const typeColorMap: Record<string, string> = {
  固定翼: '#1a6cf0',
  旋翼机: '#0e9e6e',
  无人机: '#8c56ff',
  运输机: '#e6a23c',
  战斗机: '#e63c3c',
  侦察机: '#3c9ee6',
}

function getTypeColor(type: string) {
  return typeColorMap[type] ?? '#6c7a8d'
}
</script>

<template>
  <div class="aircraft-card" @click="router.push(`/aircraft/${props.aircraft.id}`)">
    <div class="card-header">
      <span class="aircraft-name">{{ aircraft.name }}</span>
      <span class="type-badge" :style="{ background: getTypeColor(aircraft.type) }">
        {{ aircraft.type }}
      </span>
    </div>
    <div class="card-body">
      <div class="info-row" v-if="aircraft.configName">
        <span class="info-label">构型</span>
        <span class="info-value config-name">{{ aircraft.configName }}</span>
      </div>
      <div class="info-row" v-else>
        <span class="info-label">构型</span>
        <span class="info-value no-config">暂无构型</span>
      </div>
      <div class="info-row" v-if="aircraft.createdAt">
        <span class="info-label">创建时间</span>
        <span class="info-value">{{ aircraft.createdAt }}</span>
      </div>
    </div>
    <div class="card-footer">
      <span class="status-dot"></span>
      <span class="status-text">状态正常</span>
    </div>
  </div>
</template>

<style scoped>
.aircraft-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(26, 108, 240, 0.08);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  border: 1px solid #e8edf5;
}

.aircraft-card:hover {
  box-shadow: 0 6px 24px rgba(26, 108, 240, 0.18);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.aircraft-name {
  font-size: 16px;
  font-weight: 700;
  color: #0d1f3c;
}

.type-badge {
  font-size: 12px;
  color: #fff;
  border-radius: 20px;
  padding: 2px 10px;
  font-weight: 500;
  flex-shrink: 0;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: #8c9ab0;
  min-width: 56px;
}

.info-value {
  color: #3a4a5c;
  font-weight: 500;
}

.config-name {
  color: #1a6cf0;
}

.no-config {
  color: #bcc5d0;
  font-style: italic;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #f0f3f8;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00c87a;
  display: inline-block;
}

.status-text {
  font-size: 12px;
  color: #8c9ab0;
}
</style>
