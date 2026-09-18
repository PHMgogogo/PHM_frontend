<!--
  以「时序数据查询」为数据源的训练 / 推理配置弹窗。

  三方（航新/633）单机没有本地 CSV 表，训练数据只能来自 POST /csv/query-timeseries，
  故这里不选数据表，而是把时序页已经查过的定位信息（架次 sortieKey / 机号 / 起止时间）
  连同选中的属性名一起提交（见 TimeseriesJobRequest）。
  本地单机的训练仍走数据管理里的 CSV 表链路，本弹窗只在三方单机出现。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/task'
import { useTaskStore } from '@/stores/task'
import { buildTimeseriesJobRequest } from '@/utils/timeseries'
import type { Sortie, TaskResponse } from '@/types/entities'

const props = defineProps<{
  modelValue: boolean
  /** train = 训练（多 epoch / 学习率）；infer = 推理 */
  mode: 'train' | 'infer'
  sortie: Sortie
  /** 时序页当前的属性候选，作为数据列 / 标签列的选项 */
  properties: string[]
  startTime?: string
  endTime?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'success'): void
  (e: 'navigate-to-tasks'): void
}>()

const taskStore = useTaskStore()

const isTrain = computed(() => props.mode === 'train')
const title = computed(() => (isTrain.value ? '基于时序数据的训练配置' : '基于时序数据的推理配置'))
const submitText = computed(() => (isTrain.value ? '开始训练' : '开始推理'))

// ---- 会话（算法实例的载体） ----
const tasks = ref<TaskResponse[]>([])
const tasksLoading = ref(false)
const selectedTaskId = ref<number | null>(null)
const noTasksAvailable = ref(false)

// ---- 列与参数 ----
const selectedDataCols = ref<string[]>([])
const selectedLabelCols = ref<string[]>([])
const epoch = ref(10)
const batchSize = ref(32)
const learningRate = ref(0.001)
const device = ref<'CPU' | 'GPU (CUDA)'>('CPU')
const detach = ref(true)

const deviceOptions = [
  { label: 'CPU', value: 'CPU' },
  { label: 'GPU (CUDA)', value: 'GPU (CUDA)' },
]

/** 属性候选去重去空，下拉顺序与用户查询时看到的一致 */
const columns = computed(() => [...new Set(props.properties.map((s) => s.trim()).filter(Boolean))])

const selectedTask = computed(() => tasks.value.find((t) => t.task_id === selectedTaskId.value))

const submitting = ref(false)

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    // 每次打开都重置，避免上次的列选择带到另一架次
    selectedTaskId.value = null
    tasks.value = []
    noTasksAvailable.value = false
    epoch.value = 10
    batchSize.value = 32
    learningRate.value = 0.001
    device.value = 'CPU'
    detach.value = true
    submitting.value = false

    // 默认列：最后一列做标签、其余做输入（时序属性都是数值列，不存在 CSV 那种文本列限制）。
    // 只有一个属性时不做「自己既是输入又是标签」的猜测，只预填输入列，标签留空由用户挑。
    const all = columns.value
    selectedLabelCols.value = all.length > 1 ? [all[all.length - 1]] : []
    selectedDataCols.value = all.length > 1 ? all.slice(0, -1) : [...all]

    tasksLoading.value = true
    try {
      const res = await taskApi.listByAircraft(props.sortie.aircraftNumber)
      tasks.value = res.tasks
      noTasksAvailable.value = res.tasks.length === 0
      // 默认选中当前对话所在的会话
      const current = taskStore.currentTask
      const match = current && tasks.value.find((t) => t.task_id === current.id)
      if (match) selectedTaskId.value = match.task_id
    } catch (e) {
      ElMessage.error('加载会话列表失败: ' + (e as Error).message)
    } finally {
      tasksLoading.value = false
    }
  },
)

function handleClose() {
  emit('update:modelValue', false)
}

function handleNavigateToTasks() {
  emit('update:modelValue', false)
  emit('navigate-to-tasks')
}

async function handleConfirm() {
  const task = selectedTask.value
  if (!task) {
    ElMessage.warning('请选择一个会话')
    return
  }
  if (!task.instance_id) {
    ElMessage.warning('所选会话缺少实例，请先在会话管理中配置实例')
    return
  }
  if (!selectedDataCols.value.length) {
    ElMessage.warning('请至少选择一列数据列')
    return
  }
  if (!selectedLabelCols.value.length) {
    ElMessage.warning('请至少选择一列标签列')
    return
  }

  const request = buildTimeseriesJobRequest({
    sortie: props.sortie,
    mode: props.mode,
    dataCols: selectedDataCols.value,
    labelCols: selectedLabelCols.value,
    instanceId: task.instance_id,
    startTime: props.startTime,
    endTime: props.endTime,
    batchSize: batchSize.value,
    epoch: epoch.value,
    learningRate: learningRate.value,
    device: device.value === 'GPU (CUDA)' ? 'cuda' : 'cpu',
    detach: detach.value,
  })

  submitting.value = true
  try {
    if (isTrain.value) await taskApi.trainWithTimeseries(request)
    else await taskApi.inferWithTimeseries(request)
    ElMessage.success(
      isTrain.value ? '训练已启动，请前往"会话管理"查看进度' : '推理已启动，请前往"会话管理"查看结果',
    )
    emit('success')
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error((isTrain.value ? '训练' : '推理') + '启动失败: ' + (e as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="580px"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="handleClose"
  >
    <!-- 数据来源：时序查询的条件，只读回显 -->
    <div class="source-line">
      <el-tag size="small" type="warning" effect="light">数据源：时序数据查询</el-tag>
      <span class="source-item">机号 {{ sortie.aircraftNumber || '-' }}</span>
      <span class="source-item">架次 {{ sortie.sortieNumber || '-' }}</span>
      <span v-if="startTime || endTime" class="source-item">
        时间 {{ startTime || '架次起' }} ~ {{ endTime || '架次止' }}
      </span>
      <span v-else class="source-item">时间：按架次起止</span>
    </div>

    <el-form label-width="100px" class="job-form">
      <el-form-item label="选择会话">
        <el-select
          v-model="selectedTaskId"
          placeholder="请选择会话"
          :loading="tasksLoading"
          style="width: 100%"
        >
          <el-option v-for="t in tasks" :key="t.task_id" :label="t.name" :value="t.task_id" />
        </el-select>
        <div v-if="noTasksAvailable" class="no-task-hint">
          暂无可用会话，
          <a class="hint-link" @click="handleNavigateToTasks">前往会话管理</a>创建
        </div>
        <div v-else class="task-hint">
          训练 / 推理跑在会话绑定的算法实例上，
          <a class="hint-link" @click="handleNavigateToTasks">前往会话管理</a>可新建会话
        </div>
      </el-form-item>

      <!-- 列选项来自时序查询的属性，与是否已选会话无关，故不跟着会话选择做步骤门控 -->
      <el-form-item label="数据列" required>
        <el-select
          v-model="selectedDataCols"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="3"
          placeholder="选择数据列"
          style="width: 100%"
        >
          <el-option v-for="col in columns" :key="col" :label="col" :value="col" />
        </el-select>
      </el-form-item>

      <el-form-item label="标签列" required>
        <el-select
          v-model="selectedLabelCols"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="3"
          placeholder="选择标签列"
          style="width: 100%"
        >
          <el-option v-for="col in columns" :key="col" :label="col" :value="col" />
        </el-select>
      </el-form-item>

      <template v-if="isTrain">
        <el-form-item label="Epoch">
          <el-input-number v-model="epoch" :min="1" :max="10000" />
        </el-form-item>
        <el-form-item label="学习率">
          <el-input-number v-model="learningRate" :step="0.0001" :min="0" :precision="4" />
        </el-form-item>
      </template>

      <el-form-item label="Batch Size">
        <el-input-number v-model="batchSize" :min="1" :max="4096" />
      </el-form-item>

      <el-form-item label="设备">
        <el-select v-model="device" style="width: 160px">
          <el-option v-for="d in deviceOptions" :key="d.value" :label="d.label" :value="d.value" />
        </el-select>
      </el-form-item>

      <div class="tip-line">
        取数属性 = 数据列 ∪ 标签列；时间留空时由后端按该架次的起止时间取数
      </div>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="submitting">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="selectedTaskId === null"
        @click="handleConfirm"
      >
        {{ submitText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.source-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: #f7f9fc;
  border: 1px solid #e4ebf5;
  border-radius: 8px;
  font-size: 13px;
  color: #3a4a5c;
}

.source-item {
  color: #6a7a90;
}

.el-form :deep(.el-form-item__label) {
  font-size: 13px;
  white-space: nowrap;
}

.no-task-hint,
.task-hint,
.tip-line {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.tip-line {
  margin-top: 0;
}

.hint-link {
  color: #1a6cf0;
  cursor: pointer;
}

.hint-link:hover {
  text-decoration: underline;
}
</style>
