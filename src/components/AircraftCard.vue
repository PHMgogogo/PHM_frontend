<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Aircraft } from '@/types/entities'

const props = defineProps<{
  aircraft: Aircraft
}>()

const router = useRouter()

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '活跃', color: '#00c87a' },
  retired: { label: '已退役', color: '#8c9ab0' },
  maintenance: { label: '维护中', color: '#e6a23c' },
}

function statusInfo(status: string) {
  return STATUS_MAP[status] ?? { label: status, color: '#8c9ab0' }
}
</script>

<template>
  <div
    class="aircraft-card"
    @click="router.push(`/aircraft/${props.aircraft.aircraftNumber}`)"
  >
    <div class="card-header">
      <span class="aircraft-name">{{ aircraft.aircraftNumber }}</span>
      <span class="model-badge">{{ aircraft.modelCode }}</span>
    </div>
    <div class="card-body">
      <div class="info-row" v-if="aircraft.airline">
        <span class="info-label">航司</span>
        <span class="info-value">{{ aircraft.airline }}</span>
      </div>
      <div class="info-row" v-if="aircraft.configVersion">
        <span class="info-label">构型版本</span>
        <span class="info-value config-version">{{ aircraft.configVersion }}</span>
      </div>
      <div class="info-row" v-if="aircraft.createdAt">
        <span class="info-label">创建时间</span>
        <span class="info-value">{{ aircraft.createdAt }}</span>
      </div>
    </div>
    <div class="card-footer">
      <span
        class="status-dot"
        :style="{ background: statusInfo(aircraft.status).color }"
      ></span>
      <span class="status-text">{{ statusInfo(aircraft.status).label }}</span>
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

.model-badge {
  font-size: 12px;
  color: #fff;
  background: #1a6cf0;
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

.config-version {
  color: #1a6cf0;
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
  display: inline-block;
}

.status-text {
  font-size: 12px;
  color: #8c9ab0;
}
</style>
