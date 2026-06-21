<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/task'
import { getCsvOverview } from '@/api/csv'
import type { ConfigDataMapping, TaskResponse, InferTaskRequest } from '@/types/entities'

const props = defineProps<{
  modelValue: boolean
  mapping: ConfigDataMapping | null
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'success'): void
  (e: 'navigate-to-tasks'): void
}>()

const noTasksAvailable = ref(false)

// ---- 步骤1：选择算法任务 ----
const tasks = ref<TaskResponse[]>([])
const tasksLoading = ref(false)
const selectedTaskId = ref<number | null>(null)

// ---- 步骤2：选择数据列 / 标签列（标签列可选） ----
const allColumns = ref<string[]>([])
const columnsLoading = ref(false)
const selectedDataCols = ref<string[]>([])
const selectedLabelCols = ref<string[]>([])

// ---- 步骤3：推理参数（无 epoch、learning_rate） ----
const batchSize = ref(32)
const device = ref('CPU')
const backgroundRun = ref(true)

// ---- 提交 ----
const submitting = ref(false)

// ---- 设备选项 ----
const deviceOptions = [
  { label: 'CPU', value: 'CPU' },
  { label: 'GPU (CUDA)', value: 'GPU (CUDA)' },
]

// ---- 对话框打开时加载数据 ----
watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible || !props.mapping) return
    // 重置
    selectedTaskId.value = null
    selectedDataCols.value = []
    selectedLabelCols.value = []
    batchSize.value = 32
    device.value = 'CPU'
    backgroundRun.value = true
    submitting.value = false

    // 并行加载任务列表和列名
    tasksLoading.value = true
    columnsLoading.value = true
    try {
      const [taskRes, overview] = await Promise.all([
        taskApi.listByAircraft(props.aircraftNumber),
        getCsvOverview(props.mapping.mappingId),
      ])
      tasks.value = taskRes.tasks
      noTasksAvailable.value = taskRes.tasks.length === 0
      allColumns.value = overview.dataColumns ?? []
    } catch (e) {
      ElMessage.error('加载配置数据失败: ' + (e as Error).message)
    } finally {
      tasksLoading.value = false
      columnsLoading.value = false
    }
  },
)

// ---- 当前选中任务 ----
function selectedTask(): TaskResponse | undefined {
  return tasks.value.find((t) => t.task_id === selectedTaskId.value)
}

// ---- 设备值映射 ----
function mapDevice(uiDevice: string): 'cpu' | 'cuda' {
  return uiDevice === 'GPU (CUDA)' ? 'cuda' : 'cpu'
}

// ---- 确认提交 ----
async function handleConfirm() {
  if (!props.mapping) return

  const task = selectedTask()
  if (!task) {
    ElMessage.warning('请选择一个算法任务')
    return
  }
  if (!task.instance_id) {
    ElMessage.warning('所选算法缺少实例，请先在算法管理中配置实例')
    return
  }
  if (selectedDataCols.value.length === 0) {
    ElMessage.warning('请至少选择一列数据列')
    return
  }

  const request: InferTaskRequest = {
    table_name: props.mapping.csvTableName,
    data_cols: selectedDataCols.value,
    label_cols: selectedLabelCols.value,
    instance_id: task.instance_id,
    batch_size: batchSize.value,
    device: mapDevice(device.value),
    detach: backgroundRun.value,
  }

  submitting.value = true
  try {
    await taskApi.inferWithCsv(request)
    ElMessage.success('推理已启动，请前往"算法管理"查看推理结果')
    emit('success')
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error('推理启动失败: ' + (e as Error).message)
  } finally {
    submitting.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}

function handleNavigateToTasks() {
  emit('update:modelValue', false)
  emit('navigate-to-tasks')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="推理配置"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="handleClose"
  >
    <!-- 步骤1：选择算法任务 -->
    <el-form label-width="100px">
      <el-form-item label="选择算法">
        <el-select
          v-model="selectedTaskId"
          placeholder="请选择算法任务"
          :loading="tasksLoading"
          style="width: 100%"
        >
          <el-option
            v-for="t in tasks"
            :key="t.task_id"
            :label="t.name"
            :value="t.task_id"
          >
            <span>{{ t.name }}</span>
            <span
              v-if="t.default"
              style="margin-left: 8px; font-size: 12px; color: #909399"
            >（默认）</span>
          </el-option>
        </el-select>
        <div v-if="noTasksAvailable" class="no-task-hint">
          暂无可用算法，
          <a class="hint-link" @click="handleNavigateToTasks">前往算法管理</a>
          创建
        </div>
        <div v-else class="task-hint">
          没有合适的算法？
          <a class="hint-link" @click="handleNavigateToTasks">前往算法管理</a>
          新建
        </div>
      </el-form-item>

      <!-- 步骤2：列选择（仅在选择任务后展示） -->
      <template v-if="selectedTaskId !== null">
        <el-form-item label="数据列" required>
          <el-select
            v-model="selectedDataCols"
            multiple
            placeholder="选择数据列"
            :loading="columnsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="col in allColumns"
              :key="col"
              :label="col"
              :value="col"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="标签列">
          <el-select
            v-model="selectedLabelCols"
            multiple
            placeholder="选择标签列（可选）"
            :loading="columnsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="col in allColumns"
              :key="col"
              :label="col"
              :value="col"
            />
          </el-select>
        </el-form-item>

        <!-- 步骤3：推理参数（无 epoch、学习率） -->
        <div class="config-form-row">
          <el-form-item label="Batch Size">
            <el-input-number v-model="batchSize" :min="1" :max="4096" />
          </el-form-item>
          <el-form-item label="设备">
            <el-select v-model="device" style="width: 160px">
              <el-option
                v-for="d in deviceOptions"
                :key="d.value"
                :label="d.label"
                :value="d.value"
              />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="后台运行">
          <el-switch v-model="backgroundRun" />
          <span class="hint-text">{{ backgroundRun ? '异步执行' : '同步阻塞' }}</span>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="submitting">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="selectedTaskId === null"
        @click="handleConfirm"
      >
        开始推理
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.el-form :deep(.el-form-item__label) {
  font-size: 13px;
  white-space: nowrap;
}

.el-form :deep(.el-input__inner) {
  font-size: 13px;
  font-family: inherit;
}

.config-form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.config-form-row .el-form-item {
  flex: 1;
  min-width: 0;
  margin-bottom: 18px;
}

.hint-text {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.no-task-hint,
.task-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.hint-link {
  color: #1a6cf0;
  cursor: pointer;
  text-decoration: none;
}

.hint-link:hover {
  text-decoration: underline;
}
</style>
