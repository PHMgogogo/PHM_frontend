<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { Search, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useChatStore } from '@/stores/chat'
import { instanceApi } from '@/api/instance'
import { workerApi } from '@/api/instance-worker'
import TaskDialog from '@/components/TaskDialog.vue'
import CsvPreview from '@/components/CsvPreview.vue'
import type { Task, TrainRequest, InferRequest, StateResponse } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'enter-chat', task: Task): void
}>()

const taskStore = useTaskStore()
const chatStore = useChatStore()

const searchKeyword = ref('')
const showTaskDialog = ref(false)

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
const basicInfoForm = reactive({ name: '', description: '' })
const originalBasicInfo = reactive({ name: '', description: '' })
const basicInfoDirty = ref(false)
const basicInfoSaving = ref(false)
const basicInfoRules: FormRules = {
  name: [{ required: true, message: '请输入算法名称', trigger: 'blur' }],
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

// ---- 查询推理结果 ----
const queryDialogVisible = ref(false)
const queryResult = ref<StateResponse | null>(null)
const queryLoading = ref(false)

// ---- 下拉选项 ----
const deviceOptions = [
  { label: 'CPU', value: 'CPU' },
  { label: 'GPU (CUDA)', value: 'GPU (CUDA)' },
]

// ---- dirty 追踪 ----
watch(
  () => [basicInfoForm.name, basicInfoForm.description],
  () => {
    basicInfoDirty.value =
      basicInfoForm.name !== originalBasicInfo.name ||
      basicInfoForm.description !== originalBasicInfo.description
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
  originalBasicInfo.name = task.name
  originalBasicInfo.description = task.description
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
    })
    originalBasicInfo.name = basicInfoForm.name
    originalBasicInfo.description = basicInfoForm.description
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
      '重启实例将中断当前正在运行的算法，确定继续？',
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

// ---- 查询推理结果 ----
async function handleQueryTask(task: Task) {
  if (!task.instanceId) {
    ElMessage.warning('该算法没有关联的算法实例')
    return
  }
  queryLoading.value = true
  queryResult.value = null
  try {
    const response = await workerApi.getState(task.instanceId, 1)
    if (response.state === 'LOADED') {
      queryResult.value = response
      queryDialogVisible.value = true
    } else {
      ElMessage.warning('算法执行中')
    }
  } catch (e) {
    ElMessage.error('查询失败: ' + (e as Error).message)
  } finally {
    queryLoading.value = false
  }
}

// ---- 现有函数 ----
function handleCreateTaskClick() {
  showTaskDialog.value = true
}

async function onTaskConfirm(data: { name: string; description: string }) {
  const result = await taskStore.createTask(data)
  if (result) showTaskDialog.value = false
}

function handleDeleteTask(task: Task) {
  ElMessageBox.confirm(
    `确认删除算法「${task.name}」？删除后将同时清理关联的会话与算法实例，此操作不可恢复。`,
    '删除算法',
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
    ElMessage.warning('工作目录信息不可用。请重新创建算法。')
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
      <h2 class="page-title">算法管理</h2>
    </div>

    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索算法名称..."
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
        + 创建算法
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
          :class="{ current: currentTask?.id === task.id }"
        >
          <div class="task-info">
            <div class="task-name">
              <span class="task-name-text">{{ truncate(task.name, 20) }}</span>
              <span v-if="currentTask?.id === task.id" class="current-tag">当前算法</span>
            </div>
            <div class="task-desc">{{ task.description || '暂无描述' }}</div>
          </div>
          <div class="task-actions">
            <el-button type="primary" size="small" @click="handleEditTask(task)">
              编辑
            </el-button>
            <el-button
              type="primary"
              plain
              size="small"
              @click="toggleConfigPanel(task)"
            >
              {{ expandedTaskId === task.id ? '收起配置' : '配置' }}
            </el-button>
            <el-button type="primary" plain size="small" :loading="queryLoading" @click="handleQueryTask(task)">
              查询
            </el-button>
            <el-button type="danger" size="small" @click="handleDeleteTask(task)">
              删除
            </el-button>
          </div>
        </div>

        <!-- 配置面板 -->
        <Transition name="config-slide">
          <div v-if="expandedTaskId === task.id" class="config-panel">
            <el-collapse :model-value="['basic', 'algo']">
              <!-- ============ 区域一：算法信息 ============ -->
              <el-collapse-item title="算法信息" name="basic">
                <template #title>
                  <span class="collapse-title">算法信息</span>
                  <span v-if="basicInfoDirty" class="dirty-tag">已修改</span>
                </template>

                <el-form
                  :ref="setBasicInfoFormRef"
                  :model="basicInfoForm"
                  :rules="basicInfoRules"
                  label-width="80px"
                  class="config-form"
                >
                  <el-form-item label="算法名称" prop="name">
                    <el-input
                      v-model="basicInfoForm.name"
                      placeholder="请输入算法名称"
                      clearable
                    />
                  </el-form-item>
                  <el-form-item label="算法描述">
                    <el-input
                      v-model="basicInfoForm.description"
                      type="textarea"
                      :rows="3"
                      placeholder="请输入算法描述（可选）"
                      resize="none"
                    />
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

              <!-- ============ 区域二：算法配置 ============ -->
              <el-collapse-item name="algo">
                <template #title>
                  <span class="collapse-title">算法配置</span>
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
                    该算法没有关联的算法实例
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
        暂无算法，点击"创建算法"开始
      </div>
    </div>
  </div>

  <!-- 推理结果查询弹窗 -->
  <el-dialog
    v-model="queryDialogVisible"
    title="推理结果"
    width="640px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-if="queryResult?.result?.length">
      <pre class="query-result-json">{{ JSON.stringify(queryResult.result, null, 2) }}</pre>
    </div>
    <div v-else class="query-result-empty">
      暂无推理结果数据
    </div>
    <template #footer>
      <el-button @click="queryDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 任务创建弹窗 -->
  <TaskDialog
    v-model:visible="showTaskDialog"
    :loading="taskStore.creating"
    @confirm="onTaskConfirm"
  />

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
  font-size: 16px;
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

.no-instance-tip {
  font-size: 12px;
  color: #8c9ab0;
  background: #f0f3f8;
  border-radius: 10px;
  padding: 1px 8px;
  font-weight: 500;
}

/* ---- 算法配置内部 ---- */
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

/* ---- 推理结果弹窗 ---- */
.query-result-json {
  background: #f6f8fb;
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  color: #2c3e50;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.query-result-empty {
  text-align: center;
  color: #8c9ab0;
  font-size: 14px;
  padding: 32px 0;
}
</style>
