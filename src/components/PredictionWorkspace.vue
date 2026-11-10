<template>
  <div class="prediction-workspace">
    <el-tabs v-model="activeTab" class="prediction-tabs">
      <el-tab-pane label="故障预测" name="prediction">
        <PersistedModelWorkspace
          :aircraft-number="aircraftNumber"
          :model-code="modelCode"
          page-title="故障预测"
          page-subtitle="选择架次与已保存模型，查看对应算法实例的故障预测结果"
          model-column-title="算法模型"
          result-column-title="故障预测结果"
          instance-result-title="模型实例故障预测结果"
          empty-model-description="该架次暂无已保存模型"
          empty-result-description="从中栏选择模型后查看故障预测结果"
          @open-timeseries="emit('open-timeseries', $event)"
          @open-model-management="emit('open-model-management')"
        />
      </el-tab-pane>
      <el-tab-pane label="设备寿命" name="life" lazy>
        <AircraftLifePanel :aircraft-number="aircraftNumber" :model-code="modelCode" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PersistedModelWorkspace from '@/components/PersistedModelWorkspace.vue'
import AircraftLifePanel from '@/components/AircraftLifePanel.vue'
import type { Sortie } from '@/types/entities'

const activeTab = ref<'prediction' | 'life'>('prediction')

defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const emit = defineEmits<{
  (e: 'open-timeseries', sortie: Sortie): void
  (e: 'open-model-management'): void
}>()
</script>

<style scoped>
.prediction-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prediction-tabs {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.prediction-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0;
  padding: 10px 24px 0;
}

.prediction-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.prediction-tabs :deep(.el-tab-pane) {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
