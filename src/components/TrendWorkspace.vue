<template>
  <PersistedModelWorkspace
    :aircraft-number="aircraftNumber"
    :model-code="modelCode"
    page-title="趋势分析"
    page-subtitle="选择架次与已保存模型，查看对应算法实例的趋势分析结果"
    model-column-title="算法模型"
    result-column-title="趋势分析结果"
    instance-result-title="模型实例趋势分析结果"
    empty-model-description="该架次暂无已保存模型"
    empty-result-description="从中栏选择模型后查看趋势分析结果"
    @open-timeseries="emit('open-timeseries', $event)"
    @open-model-management="emit('open-model-management')"
  />
</template>

<script setup lang="ts">
import PersistedModelWorkspace from '@/components/PersistedModelWorkspace.vue'
import type { Sortie } from '@/types/entities'

defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const emit = defineEmits<{
  (e: 'open-timeseries', sortie: Sortie): void
  (e: 'open-model-management'): void
}>()
</script>
