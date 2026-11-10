<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAircraftStore } from '@/stores/aircraft'
import { isExternalAircraft, aircraftSourceText } from '@/utils/aircraft-source'
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
const isExternal = computed(() => isExternalAircraft(props.aircraft))

function openAircraft() {
  router.push(`/aircraft/${props.aircraft.aircraftNumber}`)
}

async function handleDelete(e: Event) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(
      `确定要删除飞机"${props.aircraft.aircraftNumber}"吗？其全部架次、CSV数据表和构型寿命数据也会一并删除，此操作不可撤销。`,
      '删除飞机确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await aircraftStore.deleteAircraft(props.aircraft.aircraftNumber, props.aircraft.modelCode)
    ElMessage.success('飞机已删除')
    emit('deleted')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error('删除飞机失败: ' + (e as Error).message)
    }
  }
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
        <span class="info-value">{{ aircraftSourceText(aircraft) }}</span>
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
  border-radius: var(--phm-radius-card);
  box-shadow: var(--phm-shadow-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: border-color var(--phm-transition), box-shadow var(--phm-transition), transform var(--phm-transition);
  border: 1px solid var(--phm-border);
  height: 100%;
}

.aircraft-card:hover {
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

.aircraft-name {
  font-size: 16px;
  font-weight: 650;
  color: var(--phm-text);
}

.model-badge {
  font-size: 12px;
  color: var(--phm-primary-700);
  background: var(--phm-primary-50);
  border: 1px solid #cfe5df;
  border-radius: 4px;
  padding: 2px 8px;
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
  color: var(--phm-text-muted);
  min-width: 56px;
}

.info-value {
  color: #40504e;
  font-weight: 500;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--phm-border);
  margin-top: auto;
}

.delete-btn {
  margin-left: auto;
}
</style>
