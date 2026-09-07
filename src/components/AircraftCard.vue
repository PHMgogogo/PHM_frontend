<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAircraftStore } from '@/stores/aircraft'
import { sourceText } from '@/api/unified'
import type { Aircraft } from '@/types/entities'

const props = defineProps<{
  aircraft: Aircraft
}>()

const emit = defineEmits<{
  (e: 'deleted'): void
}>()

const router = useRouter()
const aircraftStore = useAircraftStore()

/** 是否为外部平台（航新/633）单机：外部来源仅可查看，无删除等本地操作 */
const isExternal = computed(
  () => props.aircraft.source !== undefined && props.aircraft.source !== 'local',
)

function openAircraft() {
  router.push({
    path: `/aircraft/${props.aircraft.aircraftNumber}`,
    query: props.aircraft.source ? { source: props.aircraft.source } : {},
  })
}

async function handleDelete(e: Event) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(
      `确定要删除飞机"${props.aircraft.aircraftNumber}"吗？此操作不可撤销。`,
      '删除飞机确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await aircraftStore.deleteAircraft(props.aircraft.aircraftNumber)
    ElMessage.success('飞机已删除')
    emit('deleted')
  } catch { /* cancelled */ }
}

</script>

<template>
  <div class="aircraft-card" @click="openAircraft">
    <div class="card-header">
      <span class="aircraft-name">{{ aircraft.aircraftNumber }}</span>
      <span v-if="aircraft.modelCode" class="model-badge">{{ aircraft.modelCode }}</span>
    </div>
    <div class="card-body">
      <div class="info-row">
        <span class="info-label">来源</span>
        <span class="info-value">{{ aircraft.source ? sourceText(aircraft.source) : '*' }}</span>
      </div>
    </div>
    <div class="card-footer" v-if="!isExternal">
      <el-button
        class="delete-btn"
        :icon="Delete"
        circle
        size="small"
        type="danger"
        text
        @click.stop="handleDelete"
      />
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

.card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #f0f3f8;
}

.delete-btn {
  margin-left: auto;
}
</style>
