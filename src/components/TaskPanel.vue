<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useChatStore } from '@/stores/chat'
import { instanceApi } from '@/api/instance'
import { workerApi } from '@/api/instance-worker'
import TaskDialog from '@/components/TaskDialog.vue'
import CsvPreview from '@/components/CsvPreview.vue'
import type { Task, TrainRequest, InferRequest, ProgressCounter, ModelResult } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'enter-chat', task: Task): void
}>()

const taskStore = useTaskStore()
const chatStore = useChatStore()
const router = useRouter()

const searchKeyword = ref('')
const showTaskDialog = ref(false)

// ---- 状态轮询 ----

const STATE_LABELS: Record<string, string> = {
  UNLOADED: '未加载',
  LOADED: '已加载',
  TRAINING: '训练中',
  INFERRING: '推理中',
}

const taskStates = reactive<Record<number, string>>({})
const taskProgress = reactive<Record<number, { epoch_progress?: ProgressCounter; batch_progress?: ProgressCounter }>>({})
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

async function pollTaskStates() {
  // 防止上一轮请求未完成时重叠发起新一轮
  if (polling) return
  polling = true
  try {
    const tasks = taskStore.tasks
    // 并发请求所有任务的状态，避免串行阻塞
    await Promise.allSettled(
      tasks
        .filter((t) => t.instanceId)
        .map(async (task) => {
          try {
            const response = await workerApi.getState(task.instanceId!, 1)
            taskStates[task.id] = response.state
            taskProgress[task.id] = {
              epoch_progress: response.epoch_progress,
              batch_progress: response.batch_progress,
            }
          } catch {
            // 单个任务轮询失败静默忽略
          }
        }),
    )
    // 清理已删除任务的状态缓存
    const currentIds = new Set(tasks.map((t) => t.id))
    for (const id of Object.keys(taskStates)) {
      if (!currentIds.has(Number(id))) {
        delete taskStates[Number(id)]
      }
    }
    for (const id of Object.keys(taskProgress)) {
      if (!currentIds.has(Number(id))) {
        delete taskProgress[Number(id)]
      }
    }
  } finally {
    polling = false
  }
}

function startPolling() {
  stopPolling()
  pollTaskStates()
  pollTimer = setInterval(pollTaskStates, 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})

// ---- 推理结果查询 ----
const inferResultDialogVisible = ref(false)
const queriedInferResult = ref<ModelResult[] | null>(null)
const inferResultLoading = ref(false)

interface InferResultRow {
  id: number
  output: number[]
}
const inferResultRows = computed<InferResultRow[]>(() => {
  if (!queriedInferResult.value) return []
  const rows: InferResultRow[] = []
  for (const item of queriedInferResult.value) {
    const ids = item.ids ?? []
    const outputs = item.outputs ?? []
    const len = Math.min(ids.length, outputs.length)
    for (let i = 0; i < len; i++) {
      rows.push({ id: ids[i], output: outputs[i] })
    }
  }
  return rows
})

async function handleShowInferResult(task: Task) {
  if (!task.instanceId) {
    ElMessage.warning('该会话没有关联的实例')
    return
  }
  inferResultLoading.value = true
  queriedInferResult.value = null
  try {
    const response = await workerApi.getState(task.instanceId, 1)
    if (response.result && response.result.length > 0) {
      queriedInferResult.value = response.result
      inferResultDialogVisible.value = true
    } else {
      const stateLabel = STATE_LABELS[response.state] || response.state
      ElMessage.info(`${stateLabel}，暂无推理结果`)
    }
  } catch (e) {
    ElMessage.error('查询推理结果失败: ' + (e as Error).message)
  } finally {
    inferResultLoading.value = false
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

const filteredTasks = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const list = taskStore.tasks
  if (!kw) return list
  return list.filter((t) => t.name.toLowerCase().includes(kw))
})

const currentTask = computed(() => taskStore.getCurrentTask(props.aircraftNumber))

// ---- 当前任务进度条 ----

const currentTaskProgress = computed(() => {
  const task = currentTask.value
  if (!task) return null
  return taskProgress[task.id] ?? null
})

/** 计算训练/推理总进度百分比，综合 epoch 和 batch 两级进度 */
const currentTaskPercentage = computed(() => {
  const p = currentTaskProgress.value
  if (!p?.epoch_progress || p.epoch_progress.total === 0) return 0
  const ep = p.epoch_progress
  const bp = p.batch_progress
  // epoch 部分：每完成一个 epoch 贡献 1/epoch_total
  const epochFrac = ep.n / ep.total
  // batch 部分：当前 epoch 内的 batch 进度，权重为单 epoch 的比例
  const batchFrac = bp && bp.total > 0 ? bp.n / (bp.total * ep.total) : 0
  return Math.min(Math.round((epochFrac + batchFrac) * 100), 100)
})

/** 估算剩余时间（秒），基于 batch 处理速率 */
const currentTaskEta = computed(() => {
  const p = currentTaskProgress.value
  if (!p?.epoch_progress || !p?.batch_progress) return null
  const ep = p.epoch_progress
  const bp = p.batch_progress
  if (!bp.rate || bp.rate <= 0 || ep.total === 0 || bp.total === 0) return null
  const totalBatches = ep.total * bp.total
  const doneBatches = ep.n * bp.total + bp.n
  const remaining = totalBatches - doneBatches
  if (remaining <= 0) return 0
  return remaining / bp.rate
})

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

// ============================================================
// 配置面板
// ============================================================

// ---- 面板展开控制 ----
const expandedTaskId = ref<number | null>(null)

// ---- Section A — 任务信息 ----
const basicInfoFormRef = ref<FormInstance>()
function setBasicInfoFormRef(el: any) {
  basicInfoFormRef.value = el
}
const basicInfoForm = reactive({ name: '', description: '', isGlobal: false })
const originalBasicInfo = reactive({ name: '', description: '', isGlobal: false })
const basicInfoDirty = ref(false)
const basicInfoSaving = ref(false)
const basicInfoRules: FormRules = {
  name: [{ required: true, message: '请输入会话名称', trigger: 'blur' }],
}

// ---- Section B — tab 切换 ----
const activeMode = ref<'train' | 'inference'>('train')

// ---- Section B — 共用：模型文件 ----
const modelFile = ref<File | null>(null)

// ---- Section B — 训练参数 ----
const trainingFormRef = ref<FormInstance>()
function setTrainingFormRef(el: any) {
  trainingFormRef.value = el
}
const trainingForm = reactive({
  dataColumn: '',
  labelColumn: '',
  epoch: 10,
  batchSize: 32,
  learningRate: 0.001,
  device: 'CPU' as string,
  backgroundRun: true,
})
const trainingCsvFile = ref<File | null>(null)
const trainingDirty = ref(false)
const trainingApplying = ref(false)

// ---- Section B — 推理参数 ----
const inferenceFormRef = ref<FormInstance>()
function setInferenceFormRef(el: any) {
  inferenceFormRef.value = el
}
const inferenceForm = reactive({
  dataColumn: '',
  labelColumn: '',
  batchSize: 32,
  device: 'CPU' as string,
  backgroundRun: true,
})
const inferenceCsvFile = ref<File | null>(null)
const inferenceDirty = ref(false)
const inferenceApplying = ref(false)

// ---- 实例操作 ----
const restarting = ref(false)

// ---- 下拉选项 ----
const deviceOptions = [
  { label: 'CPU', value: 'CPU' },
  { label: 'GPU (CUDA)', value: 'GPU (CUDA)' },
]

// ---- dirty 追踪 ----
watch(
  () => [basicInfoForm.name, basicInfoForm.description, basicInfoForm.isGlobal],
  () => {
    basicInfoDirty.value =
      basicInfoForm.name !== originalBasicInfo.name ||
      basicInfoForm.description !== originalBasicInfo.description ||
      basicInfoForm.isGlobal !== originalBasicInfo.isGlobal
  },
)

watch(trainingForm, () => {
  trainingDirty.value =
    trainingForm.dataColumn !== '' ||
    trainingForm.labelColumn !== '' ||
    trainingForm.epoch !== 10 ||
    trainingForm.batchSize !== 32 ||
    trainingForm.learningRate !== 0.001 ||
    trainingForm.device !== 'CPU' ||
    trainingForm.backgroundRun !== true ||
    trainingCsvFile.value !== null
}, { deep: true })

watch(inferenceForm, () => {
  inferenceDirty.value =
    inferenceForm.dataColumn !== '' ||
    inferenceForm.labelColumn !== '' ||
    inferenceForm.batchSize !== 32 ||
    inferenceForm.device !== 'CPU' ||
    inferenceForm.backgroundRun !== true ||
    inferenceCsvFile.value !== null
}, { deep: true })

// ---- 面板切换 ----
function toggleConfigPanel(task: Task) {
  if (expandedTaskId.value === task.id) {
    closeConfigPanel()
  } else {
    openConfigPanel(task)
  }
}

function openConfigPanel(task: Task) {
  closeConfigPanel()
  expandedTaskId.value = task.id

  // 填充 Section A
  basicInfoForm.name = task.name
  basicInfoForm.description = task.description
  basicInfoForm.isGlobal = task.isGlobal
  originalBasicInfo.name = task.name
  originalBasicInfo.description = task.description
  originalBasicInfo.isGlobal = task.isGlobal
  basicInfoDirty.value = false

  // 重置 Section B 共用
  modelFile.value = null

  // 重置训练
  trainingForm.dataColumn = ''
  trainingForm.labelColumn = ''
  trainingForm.epoch = 10
  trainingForm.batchSize = 32
  trainingForm.learningRate = 0.001
  trainingForm.device = 'CPU'
  trainingForm.backgroundRun = true
  trainingCsvFile.value = null
  trainingDirty.value = false

  // 重置推理
  inferenceForm.dataColumn = ''
  inferenceForm.labelColumn = ''
  inferenceForm.batchSize = 32
  inferenceForm.device = 'CPU'
  inferenceForm.backgroundRun = true
  inferenceCsvFile.value = null
  inferenceDirty.value = false

  activeMode.value = 'train'
}

function closeConfigPanel() {
  expandedTaskId.value = null
}

// ---- 保存任务信息 ----
async function handleSaveBasicInfo() {
  try { await basicInfoFormRef.value?.validate() } catch { 
    console.error('基本信息验证失败')
    return
  }
  const taskId = expandedTaskId.value!
  basicInfoSaving.value = true
  try {
    await taskStore.updateTask(taskId, {
      name: basicInfoForm.name.trim(),
      description: basicInfoForm.description.trim(),
      isGlobal: basicInfoForm.isGlobal,
    })
    originalBasicInfo.name = basicInfoForm.name
    originalBasicInfo.description = basicInfoForm.description
    originalBasicInfo.isGlobal = basicInfoForm.isGlobal
    basicInfoDirty.value = false
  } finally {
    basicInfoSaving.value = false
  }
}

// ---- 应用训练/推理配置 ----
const applyButtonText = computed(() =>
  activeMode.value === 'train' ? '应用训练配置' : '应用推理配置'
)

/** 将 UI 设备标签映射为 API 设备值 */
function mapDevice(uiDevice: string): 'cpu' | 'cuda' {
  return uiDevice === 'GPU (CUDA)' ? 'cuda' : 'cpu'
}

/** 解析逗号分隔的列名 */
function parseColumnList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function handleApplyConfig(task: Task) {
  if (!task.instanceId) return
  if (activeMode.value === 'train') {
    try { await trainingFormRef.value?.validate() } catch {
      console.error('训练配置验证失败')
      return }
    trainingApplying.value = true
    try {
      // 读取训练 CSV 文件内容
      let csvContent = ''
      if (trainingCsvFile.value) {
        csvContent = await trainingCsvFile.value.text()
      }

      const request: TrainRequest = {
        dataset: {
          content_type: 'text_csv',
          content: csvContent,
          data_cols: parseColumnList(trainingForm.dataColumn),
          label_cols: parseColumnList(trainingForm.labelColumn),
        },
        args: {
          epoch: trainingForm.epoch,
          batch_size: trainingForm.batchSize,
          learning_rate: trainingForm.learningRate,
          device: mapDevice(trainingForm.device),
          progress: true,
          mode: 'train',
          shuffle: true,
        },
        detach: trainingForm.backgroundRun,
      }

      await workerApi.train(task.instanceId, request)
      ElMessage.success('训练已启动')
      trainingDirty.value = false
    } catch (e) {
      ElMessage.error('训练启动失败: ' + (e as Error).message)
    } finally {
      trainingApplying.value = false
    }
  } else {
    try { await inferenceFormRef.value?.validate() } catch {
      console.error('推理配置验证失败')
      return
    }
    inferenceApplying.value = true
    try {
      // 读取推理 CSV 文件内容
      let csvContent = ''
      if (inferenceCsvFile.value) {
        csvContent = await inferenceCsvFile.value.text()
      }

      const labelColsRaw = parseColumnList(inferenceForm.labelColumn)

      const request: InferRequest = {
        dataset: {
          content_type: 'text_csv',
          content: csvContent,
          data_cols: parseColumnList(inferenceForm.dataColumn),
          label_cols: labelColsRaw.length > 0 ? labelColsRaw : null,
        },
        args: {
          batch_size: inferenceForm.batchSize,
          device: mapDevice(inferenceForm.device),
          progress: true,
          mode: 'eval',
          shuffle: false,
        },
        detach: inferenceForm.backgroundRun,
      }

      await workerApi.infer(task.instanceId, request)
      ElMessage.success('推理已启动')
      inferenceDirty.value = false
    } catch (e) {
      ElMessage.error('推理启动失败: ' + (e as Error).message)
    } finally {
      inferenceApplying.value = false
    }
  }
}

// ---- 重启实例 ----
async function handleRestartInstance(task: Task) {
  if (!task.instanceId) return
  try {
    await ElMessageBox.confirm(
      '重启实例将中断当前正在运行的会话，确定继续？',
      '重启实例',
      { confirmButtonText: '确定重启', cancelButtonText: '取消', type: 'warning' },
    )
  } catch { return }
  restarting.value = true
  try {
    await instanceApi.restart(task.instanceId)
    ElMessage.success('实例已重启')
  } catch (e) {
    ElMessage.error('重启失败: ' + (e as Error).message)
  } finally {
    restarting.value = false
  }
}

// ---- 文件变更处理 ----
function handleModelFileChange(file: File) {
  modelFile.value = file
}

function handleTrainingCsvChange(file: File) {
  trainingCsvFile.value = file
}

function handleTrainingCsvRemove() {
  trainingCsvFile.value = null
}

function handleInferenceCsvChange(file: File) {
  inferenceCsvFile.value = file
}

function handleInferenceCsvRemove() {
  inferenceCsvFile.value = null
}

// ---- 面板关闭时机 ----
watch(
  () => props.aircraftNumber,
  () => { closeConfigPanel() },
)

watch(
  () => taskStore.tasks.find(t => t.id === expandedTaskId.value),
  (task) => {
    if (!task && expandedTaskId.value !== null) {
      closeConfigPanel()
    }
  },
)

// ---- 查询实例接口文档 ----
function handleQueryTask(task: Task) {
  if (!task.instanceId) {
    ElMessage.warning('该会话没有关联的实例')
    return
  }
  const { href } = router.resolve({
    name: 'algo-docs',
    params: { instanceId: task.instanceId },
  })
  window.open(href, '_blank')
}

// ---- 现有函数 ----
function handleCreateTaskClick() {
  showTaskDialog.value = true
}

async function onTaskConfirm(data: { name: string; description: string; isGlobal: boolean }) {
  const result = await taskStore.createTask(
    { name: data.name, description: data.description },
    { isGlobal: data.isGlobal },
  )
  if (result) showTaskDialog.value = false
}

function handleDeleteTask(task: Task) {
  if (task.isDefault) {
    ElMessage.warning('默认会话不可删除')
    return
  }
  ElMessageBox.confirm(
    `确认删除会话「${task.name}」？删除后将同时清理关联的会话与实例，此操作不可恢复。`,
    '删除会话',
    { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => {
      taskStore.deleteTask(task.id)
    })
    .catch(() => {
      // 用户取消
    })
}

function handleEditTask(task: Task) {
  const workDir = task.workDir
  if (!workDir) {
    ElMessage.warning('工作目录信息不可用。请重新创建会话。')
    return
  }
  taskStore.setCurrentTask(props.aircraftNumber, task.id)
  chatStore.connectToSession(task.sessionId, workDir)
  emit('enter-chat', task)
}
</script>

<template>
  <div class="page-inner">
    <div class="page-header">
      <h2 class="page-title">会话管理</h2>
    </div>

    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索会话名称..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button
        type="primary"
        class="add-btn"
        @click="handleCreateTaskClick"
      >
        + 创建会话
      </el-button>
    </div>

    <!-- 任务列表 -->
    <div class="task-list" v-loading="taskStore.loading">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-row-wrapper"
      >
        <!-- 任务行 -->
        <div
          class="task-item"
          :class="{ current: currentTask?.id === task.id, 'is-default': task.isDefault }"
        >
          <div class="task-info">
            <div class="task-name">
              <span class="task-name-text">{{ truncate(task.name, 20) }}</span>
              <span
                v-if="taskStates[task.id]"
                :class="['status-tag', `status-${taskStates[task.id].toLowerCase()}`]"
              >
                {{ STATE_LABELS[taskStates[task.id]] || taskStates[task.id] }}
              </span>
              <span v-if="currentTask?.id === task.id" class="current-tag">当前会话</span>
            </div>
            <div v-if="!task.isDefault" class="task-desc">{{ task.description || '暂无描述' }}</div>
          </div>
          <div class="task-actions">
            <el-button type="primary" size="small" @click="handleEditTask(task)">
              进入对话
            </el-button>
            <el-button type="primary" plain size="small" :loading="inferResultLoading" @click="handleShowInferResult(task)">
              推理结果
            </el-button>
            <!-- <el-button
              type="primary"
              plain
              size="small"
              @click="toggleConfigPanel(task)"
            >
              {{ expandedTaskId === task.id ? '收起配置' : '数据配置' }}
            </el-button> -->
            <el-button type="primary" plain size="small" @click="handleQueryTask(task)">
              接口查询
            </el-button>
            <el-button type="danger" size="small" :disabled="task.isDefault" @click="handleDeleteTask(task)">
              会话删除
            </el-button>
          </div>
        </div>

        <!-- 当前会话进度条 -->
        <div
          v-if="currentTask?.id === task.id && taskStates[task.id] && (taskStates[task.id] === 'TRAINING' || taskStates[task.id] === 'INFERRING')"
          class="task-progress-bar"
        >
          <div class="progress-header">
            <span class="progress-label">
              <span :class="['progress-dot', `dot-${taskStates[task.id].toLowerCase()}`]"></span>
              {{ taskStates[task.id] === 'TRAINING' ? '训练中' : '推理中' }}
            </span>
            <span class="progress-percent">{{ currentTaskPercentage }}%</span>
          </div>
          <el-progress
            :percentage="currentTaskPercentage"
            :stroke-width="8"
            :show-text="false"
            :color="taskStates[task.id] === 'TRAINING' ? '#e6a23c' : '#409eff'"
          />
          <div class="progress-details">
            <span v-if="taskProgress[task.id]?.epoch_progress">
              Epoch {{ taskProgress[task.id].epoch_progress!.n }}/{{ taskProgress[task.id].epoch_progress!.total }}
            </span>
            <span v-if="taskProgress[task.id]?.batch_progress">
              Batch {{ taskProgress[task.id].batch_progress!.n }}/{{ taskProgress[task.id].batch_progress!.total }}
            </span>
            <span v-if="taskProgress[task.id]?.epoch_progress?.elapsed">
              耗时 {{ formatElapsed(taskProgress[task.id].epoch_progress!.elapsed) }}
            </span>
            <span v-if="taskProgress[task.id]?.batch_progress?.rate">
              {{ taskProgress[task.id].batch_progress?.rate?.toFixed(1) }} batch/s
            </span>
            <span v-if="currentTaskEta">
              预计剩余 {{ formatEta(currentTaskEta) }}
            </span>
          </div>
        </div>

        <!-- 配置面板 -->
        <Transition name="config-slide">
          <div v-if="expandedTaskId === task.id" class="config-panel">
            <el-collapse :model-value="['basic', 'algo']">
              <!-- ============ 区域一：会话信息 ============ -->
              <el-collapse-item title="会话信息" name="basic">
                <template #title>
                  <span class="collapse-title">会话信息</span>
                  <span v-if="basicInfoDirty" class="dirty-tag">已修改</span>
                </template>

                <!-- 默认会话：只读提示 -->
                <div v-if="task.isDefault" class="default-notice">
                  默认会话的基础信息不可编辑
                </div>
                <!-- 普通会话：可编辑表单 -->
                <el-form
                  v-else
                  :ref="setBasicInfoFormRef"
                  :model="basicInfoForm"
                  :rules="basicInfoRules"
                  label-width="80px"
                  class="config-form"
                >
                  <el-form-item label="会话名称" prop="name">
                    <el-input
                      v-model="basicInfoForm.name"
                      placeholder="请输入会话名称"
                      clearable
                    />
                  </el-form-item>
                  <el-form-item label="会话描述">
                    <el-input
                      v-model="basicInfoForm.description"
                      type="textarea"
                      :rows="3"
                      placeholder="请输入会话描述（可选）"
                      resize="none"
                    />
                  </el-form-item>
                  <el-form-item label="会话可见性">
                    <el-switch v-model="basicInfoForm.isGlobal" />
                    <span class="visibility-hint">{{ basicInfoForm.isGlobal ? '全局可见' : '当前单机可见' }}</span>
                  </el-form-item>
                  <el-form-item>
                    <el-button
                      type="primary"
                      :loading="basicInfoSaving"
                      :disabled="!basicInfoDirty"
                      @click="handleSaveBasicInfo"
                    >
                      保存
                    </el-button>
                  </el-form-item>
                </el-form>
              </el-collapse-item>

              <!-- ============ 区域二：会话配置 ============ -->
              <el-collapse-item name="algo">
                <template #title>
                  <span class="collapse-title">会话配置</span>
                  <span v-if="!task.instanceId" class="no-instance-tip">无关联实例</span>
                  <span v-else-if="activeMode === 'train' && trainingDirty" class="dirty-tag">已修改</span>
                  <span v-else-if="activeMode === 'inference' && inferenceDirty" class="dirty-tag">已修改</span>
                </template>

                <div
                  class="algo-config-body"
                  :class="{ disabled: !task.instanceId }"
                >
                  <!-- 无实例时遮罩 -->
                  <div v-if="!task.instanceId" class="algo-disabled-overlay">
                    该会话没有关联的实例
                  </div>

                  <!-- 实例操作 -->
                  <div class="algo-row">
                    <el-button
                      type="warning"
                      plain
                      size="small"
                      :loading="restarting"
                      :disabled="!task.instanceId"
                      @click="handleRestartInstance(task)"
                    >
                      重启实例
                    </el-button>
                  </div>

                  <!-- 模型文件（共用，在 tabs 上方） -->
                  <div class="algo-row">
                    <el-form-item label="模型文件" label-width="80px">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        accept=".pt,.pth,.pkl,.onnx"
                        :on-change="(_f: any) => handleModelFileChange(_f.raw)"
                        drag
                        :disabled="!task.instanceId"
                      >
                        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                        <div class="el-upload__text">拖拽或点击上传模型文件</div>
                        <template #tip>
                          <div class="el-upload__tip">支持 .pt / .pth / .pkl / .onnx</div>
                        </template>
                      </el-upload>
                    </el-form-item>
                  </div>

                  <!-- el-tabs：训练 / 推理 -->
                  <el-tabs v-model="activeMode" class="algo-tabs">
                    <!-- ===== Tab 训练 ===== -->
                    <el-tab-pane label="训练" name="train">
                      <el-form
                        :ref="setTrainingFormRef"
                        :model="trainingForm"
                        label-width="80px"
                        class="config-form"
                        :disabled="!task.instanceId"
                      >
                        <el-form-item label="训练数据">
                          <el-upload
                            :auto-upload="false"
                            :limit="1"
                            accept=".csv"
                            :on-change="(_f: any) => handleTrainingCsvChange(_f.raw)"
                            :on-remove="handleTrainingCsvRemove"
                            drag
                            :disabled="!task.instanceId"
                          >
                            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                            <div class="el-upload__text">拖拽或点击上传训练 CSV</div>
                          </el-upload>
                          <CsvPreview v-if="trainingCsvFile" :file="trainingCsvFile" />
                        </el-form-item>

                        <div class="config-form-row">
                          <el-form-item
                            label="数据列"
                            prop="dataColumn"
                            :rules="[{ required: true, message: '请输入数据列名', trigger: 'blur' }]"
                          >
                            <el-input v-model="trainingForm.dataColumn" placeholder="" />
                          </el-form-item>
                          <el-form-item
                            label="标签列"
                            prop="labelColumn"
                            :rules="[{ required: true, message: '请输入标签列名', trigger: 'blur' }]"
                          >
                            <el-input v-model="trainingForm.labelColumn" placeholder="" />
                          </el-form-item>
                        </div>

                        <div class="config-form-row">
                          <el-form-item label="Epoch">
                            <el-input-number v-model="trainingForm.epoch" :min="1" :max="10000" />
                          </el-form-item>
                          <el-form-item label="Batch Size">
                            <el-input-number v-model="trainingForm.batchSize" :min="1" :max="4096" />
                          </el-form-item>
                          <el-form-item label="学习率">
                            <el-input-number
                              v-model="trainingForm.learningRate"
                              :step="0.0001"
                              :min="0"
                              :precision="4"
                            />
                          </el-form-item>
                        </div>

                        <div class="config-form-row">
                          <el-form-item label="设备">
                            <el-select v-model="trainingForm.device" style="width: 160px">
                              <el-option
                                v-for="d in deviceOptions"
                                :key="d.value"
                                :label="d.label"
                                :value="d.value"
                              />
                            </el-select>
                          </el-form-item>
                          <el-form-item label="后台运行">
                            <el-switch v-model="trainingForm.backgroundRun" />
                          </el-form-item>
                        </div>
                      </el-form>
                    </el-tab-pane>

                    <!-- ===== Tab 推理 ===== -->
                    <el-tab-pane label="推理" name="inference">
                      <el-form
                        :ref="setInferenceFormRef"
                        :model="inferenceForm"
                        label-width="80px"
                        class="config-form"
                        :disabled="!task.instanceId"
                      >
                        <el-form-item label="推理数据">
                          <el-upload
                            :auto-upload="false"
                            :limit="1"
                            accept=".csv"
                            :on-change="(_f: any) => handleInferenceCsvChange(_f.raw)"
                            :on-remove="handleInferenceCsvRemove"
                            drag
                            :disabled="!task.instanceId"
                          >
                            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                            <div class="el-upload__text">拖拽或点击上传推理 CSV</div>
                          </el-upload>
                          <CsvPreview v-if="inferenceCsvFile" :file="inferenceCsvFile" />
                        </el-form-item>

                        <div class="config-form-row">
                          <el-form-item
                            label="数据列"
                            prop="dataColumn"
                            :rules="[{ required: true, message: '请输入数据列名', trigger: 'blur' }]"
                          >
                            <el-input v-model="inferenceForm.dataColumn" placeholder="" />
                          </el-form-item>
                          <el-form-item label="标签列">
                            <el-input v-model="inferenceForm.labelColumn" placeholder="" />
                          </el-form-item>
                        </div>

                        <div class="config-form-row">
                          <el-form-item label="Batch Size">
                            <el-input-number v-model="inferenceForm.batchSize" :min="1" :max="4096" />
                          </el-form-item>
                          <el-form-item label="设备">
                            <el-select v-model="inferenceForm.device" style="width: 160px">
                              <el-option
                                v-for="d in deviceOptions"
                                :key="d.value"
                                :label="d.label"
                                :value="d.value"
                              />
                            </el-select>
                          </el-form-item>
                          <el-form-item label="后台运行">
                            <el-switch v-model="inferenceForm.backgroundRun" />
                          </el-form-item>
                        </div>
                      </el-form>
                    </el-tab-pane>
                  </el-tabs>

                  <!-- 底部应用按钮 -->
                  <div class="algo-apply-row">
                    <el-button
                      type="primary"
                      :loading="activeMode === 'train' ? trainingApplying : inferenceApplying"
                      :disabled="
                        !task.instanceId ||
                        (activeMode === 'train' ? trainingApplying : inferenceApplying)
                      "
                      @click="handleApplyConfig(task)"
                    >
                      {{ applyButtonText }}
                    </el-button>
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </Transition>
      </div>

      <div
        v-if="filteredTasks.length === 0 && !taskStore.loading"
        class="inner-empty"
      >
        暂无会话，点击"创建会话"开始
      </div>
    </div>
  </div>

  <!-- 任务创建弹窗 -->
  <TaskDialog
    v-model:visible="showTaskDialog"
    :loading="taskStore.creating"
    @confirm="onTaskConfirm"
  />

  <!-- 推理结果弹窗 -->
  <el-dialog
    v-model="inferResultDialogVisible"
    title="推理结果"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-if="queriedInferResult" class="infer-result">
      <div class="infer-result-stats">
        共 {{ inferResultRows.length }} 条结果
      </div>
      <div class="infer-result-table-wrap">
        <el-table :data="inferResultRows" size="small" border stripe max-height="320">
          <el-table-column label="ids" prop="id" width="100" />
          <el-table-column label="outputs">
            <template #default="{ row }">
              <span class="output-cell">{{ row.output.join(', ') }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="inferResultDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 创建进度 -->
  <div v-if="taskStore.creating" class="create-progress">
    {{ taskStore.createStep }}
  </div>
</template>

<style scoped>
/* ========== 现有样式 ========== */
.page-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 32px;
  gap: 16px;
  overflow-y: auto;
}

.page-header {
  padding: 0 0 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 0;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.add-btn {
  white-space: nowrap;
  font-weight: 600;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-row-wrapper {
  display: block;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 0 24px;
  height: 10vh;
  min-height: 72px;
  flex-shrink: 0;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.task-item:hover {
  border-color: #d4e3fb;
  box-shadow: 0 2px 8px rgba(26, 108, 240, 0.06);
}

.task-item.current {
  border-left: 3px solid #1a6cf0;
}

.task-item.current:hover {
  border-color: #e0e8f5;
  border-left: 3px solid #1a6cf0;
  box-shadow: none;
}

.task-item.is-default.current {
  border-left: 3px solid #e6a23c;
}

.task-item.is-default.current:hover {
  border-color: #e0e8f5;
  border-left: 3px solid #e6a23c;
  box-shadow: none;
}

.task-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.task-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  color: #0d1f3c;
  min-width: 0;
}

.task-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.current-tag {
  font-size: 11px;
  color: #fff;
  background: #1a6cf0;
  border-radius: 20px;
  padding: 1px 8px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 18px;
}

.status-tag {
  font-size: 11px;
  border-radius: 20px;
  padding: 1px 8px 1px 6px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 18px;
  background: #fff;
  border: 1px solid #dcdfe6;
  color: #606266;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-tag::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-unloaded::before {
  background: #8c9ab0;
}

.status-loaded::before {
  background: #67c23a;
}

.status-training::before {
  background: #e6a23c;
}

.status-inferring::before {
  background: #409eff;
}

.task-desc {
  font-size: 13px;
  color: #8c9ab0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 24px;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}

.create-progress {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a6cf0;
  color: #fff;
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(26, 108, 240, 0.3);
  z-index: 3000;
}

/* ========== 配置面板样式 ========== */

/* 展开动画 */
.config-slide-enter-active,
.config-slide-leave-active {
  transition: all 0.3s ease;
}

.config-slide-enter-from,
.config-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.config-panel {
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  margin-top: 4px;
  overflow: hidden;
}

.config-panel :deep(.el-collapse) {
  border: none;
}

.config-panel :deep(.el-collapse-item__header) {
  font-size: 16px;
  font-weight: 700;
  color: #0d1f3c;
  padding: 12px 24px;
  border-bottom: 1px solid #f0f3f8;
  background: #fafbfd;
}

.config-panel :deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid #f0f3f8;
}

.config-panel :deep(.el-collapse-item__content) {
  padding: 14px 20px;
}

.config-panel :deep(.el-form-item__label) {
  font-size: 13px;
  color: #3a4a5c;
  white-space: nowrap;
}

/* 让输入框与文本域的 placeholder / 文本字体保持一致 */
.config-panel :deep(.el-input__inner),
.config-panel :deep(.el-textarea__inner) {
  font-size: 13px;
  font-family: inherit;
}

.collapse-title {
  margin-right: 8px;
}

.dirty-tag {
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  border-radius: 10px;
  padding: 1px 8px;
  font-weight: 500;
  flex-shrink: 0;
}

.visibility-hint {
  margin-left: 10px;
  font-size: 13px;
  color: #8c9ab0;
}

.default-notice {
  font-size: 13px;
  color: #8c9ab0;
  background: #fafbfd;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
}

.no-instance-tip {
  font-size: 12px;
  color: #8c9ab0;
  background: #f0f3f8;
  border-radius: 10px;
  padding: 1px 8px;
  font-weight: 500;
}

/* ---- 会话配置内部 ---- */
.algo-config-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.algo-config-body.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.algo-disabled-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 1;
  font-size: 14px;
  color: #8c9ab0;
  font-weight: 500;
}

.algo-row {
  display: block;
}

.algo-tabs {
  margin-top: 4px;
}

.algo-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.config-form-row .el-form-item {
  flex: 1;
  min-width: 180px;
  margin-bottom: 8px;
}

.algo-apply-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid #f0f3f8;
}

/* ========== 进度条样式 ========== */

.task-progress-bar {
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  margin-top: 4px;
  padding: 14px 24px;
}

.task-progress-bar .progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.task-progress-bar .progress-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
}

.task-progress-bar .progress-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-progress-bar .dot-training {
  background: #e6a23c;
}

.task-progress-bar .dot-inferring {
  background: #409eff;
}

.task-progress-bar .progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: #1a6cf0;
}

.task-progress-bar .progress-details {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  font-size: 12px;
  color: #8c9ab0;
  flex-wrap: wrap;
}

.task-progress-bar .progress-details span {
  white-space: nowrap;
}

/* ========== 推理结果弹窗 ========== */
.infer-result {
  width: 100%;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: #fafbfd;
  border: 1px solid #e0e8f5;
  border-radius: 6px;
  box-sizing: border-box;
}

.infer-result-stats {
  font-size: 13px;
  color: #3a4a5c;
  margin-bottom: 6px;
  font-weight: 500;
  flex-shrink: 0;
}

.infer-result-table-wrap {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.output-cell {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  color: #303133;
}
</style>
