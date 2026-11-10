<template>
  <div class="health-workspace">
    <el-tabs v-model="activeTab" class="health-tabs">
      <el-tab-pane label="隐身健康状态评估" name="assessment">
        <PersistedModelWorkspace
          :aircraft-number="aircraftNumber"
          :model-code="modelCode"
          page-title="隐身健康状态评估"
          model-column-title="算法模型"
          result-column-title="隐身健康状态评估结果"
          instance-result-title="模型实例隐身健康状态评估结果"
          empty-model-description="该架次暂无已保存模型"
          empty-result-description="从中栏选择模型后查看隐身健康状态评估结果"
          @open-timeseries="emit('open-timeseries', $event)"
          @open-model-management="emit('open-model-management')"
        />
      </el-tab-pane>
      <el-tab-pane label="放飞支持" name="release" lazy>
        <ReleaseSupportPanel :aircraft-number="aircraftNumber" :model-code="modelCode" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PersistedModelWorkspace from '@/components/PersistedModelWorkspace.vue'
import ReleaseSupportPanel from '@/components/ReleaseSupportPanel.vue'
import type { Sortie } from '@/types/entities'

const activeTab = ref<'assessment' | 'release'>('assessment')

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
.health-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.health-tabs {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.health-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0;
  padding: 10px 24px 0;
}

.health-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.health-tabs :deep(.el-tab-pane) {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
