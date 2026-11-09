<template>
  <PersistedModelWorkspace
    :aircraft-number="aircraftNumber"
    :model-code="modelCode"
    page-title="增强诊断"
    page-subtitle="选择架次与已保存模型，查看对应算法实例的诊断结果"
    model-column-title="算法模型"
    result-column-title="推理结果"
    instance-result-title="模型实例诊断结果"
    empty-model-description="该架次暂无已保存模型"
    empty-result-description="从中栏选择模型后查看推理结果"
    show-timeseries-action
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
