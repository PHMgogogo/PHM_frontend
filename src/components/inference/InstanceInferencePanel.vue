<template>
  <div class="inference-panel">
    <div class="panel-head">
      <div class="panel-title">
        <el-icon><TrendCharts /></el-icon>
        <span>实例推理结果</span>
        <span v-if="instanceId" class="instance-id">{{ instanceId }}</span>
      </div>
      <div class="panel-actions">
        <el-tag :type="stateTagType" effect="plain">{{ stateLabel }}</el-tag>
        <el-button :icon="Refresh" :loading="loading" @click="loadState">刷新状态</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="panel-error"
      type="error"
      :closable="false"
      show-icon
      :title="error"
    />
    <el-empty v-else-if="!instanceId" description="当前会话没有关联实例" :image-size="70" />
    <el-empty
      v-else-if="!loading && results.length === 0"
      description="该实例暂无训练或推理结果"
      :image-size="70"
    />

    <div v-loading="loading" class="result-list">
      <InferenceResultItem
        v-for="(result, index) in results"
        :key="`${instanceId}-${index}-${result.loss}`"
        :result="result"
        :index="index"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Refresh, TrendCharts } from '@element-plus/icons-vue'
import { getInstanceState } from '@/api/instance-worker'
import type { StateResponse } from '@/types/entities'
import InferenceResultItem from './InferenceResultItem.vue'

const props = defineProps<{
  instanceId: string
}>()

const state = ref<StateResponse | null>(null)
const loading = ref(false)
const error = ref('')
let pollTimer: ReturnType<typeof setTimeout> | null = null
let requestSequence = 0

const results = computed(() => state.value?.result || [])

const stateLabel = computed(() => {
  const map: Record<StateResponse['state'], string> = {
    UNLOADED: '未加载',
    LOADED: '已加载',
    TRAINING: '训练中',
    INFERRING: '推理中',
  }
  return state.value ? map[state.value.state] : '未获取'
})

const stateTagType = computed(() => {
  if (!state.value) return 'info'
  if (state.value.state === 'TRAINING') return 'warning'
  if (state.value.state === 'INFERRING') return 'primary'
  if (state.value.state === 'LOADED') return 'success'
  return 'info'
})

function clearPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function schedulePoll() {
  clearPoll()
  const currentState = state.value?.state
  if (currentState !== 'TRAINING' && currentState !== 'INFERRING') return
  pollTimer = setTimeout(loadState, 5000)
}

async function loadState() {
  if (!props.instanceId) {
    state.value = null
    error.value = ''
    clearPoll()
    return
  }

  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const nextState = await getInstanceState(props.instanceId, 1)
    if (sequence !== requestSequence) return
    state.value = nextState
  } catch (e) {
    if (sequence !== requestSequence) return
    state.value = null
    error.value = `读取实例状态失败：${(e as Error).message}`
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
      schedulePoll()
    }
  }
}

watch(
  () => props.instanceId,
  () => {
    clearPoll()
    state.value = null
    loadState()
  },
  { immediate: true },
)

onBeforeUnmount(clearPoll)
</script>

<style scoped>
.inference-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0d1f3c;
  font-weight: 600;
}

.instance-id {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8c9ab0;
  font-size: 12px;
  font-weight: 400;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-error {
  margin-bottom: 4px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}
</style>
