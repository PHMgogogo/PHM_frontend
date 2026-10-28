<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  ALGO_FAMILY_OPTIONS,
  ALGO_TASK_KIND_OPTIONS,
  ALL_ALGO_LABEL,
  BASE_ALGO_LABEL,
  DEFAULT_HIGHLEVEL_ALGO,
  buildAlgoId,
  listSelectableAlgos,
} from '@/api/instance'
import type { AlgoFamily, AlgoTaskKind } from '@/api/instance'

const props = defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (
    e: 'confirm',
    data: { name: string; description: string; algo: string },
  ): void
}>()

/** 生成默认会话名称，如「会话 20260914-1530」 */
function buildDefaultName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `会话 ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/** 基础算法选择模式：基础模型 / 分析算法（类型×任务）/ 全部模型（平铺列表） */
type AlgoMode = 'base' | 'analysis' | 'all'

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
  mode: 'base' as AlgoMode,
  family: 'dl' as AlgoFamily,
  taskKind: 'afd' as AlgoTaskKind,
  /** 「全部模型」模式下选中的算法 id */
  algoId: '',
})

const familyOptions = ALGO_FAMILY_OPTIONS
const taskKindOptions = ALGO_TASK_KIND_OPTIONS
const baseAlgoLabel = BASE_ALGO_LABEL
const allAlgoLabel = ALL_ALGO_LABEL

/** 「全部模型」下拉数据（base_on=framework 的算法 id），懒加载 */
const allAlgoOptions = ref<string[]>([])
const allAlgoLoading = ref(false)

async function loadAllAlgos() {
  if (allAlgoOptions.value.length) return
  allAlgoLoading.value = true
  try {
    allAlgoOptions.value = await listSelectableAlgos()
  } catch {
    ElMessage.error('获取算法列表失败')
  } finally {
    allAlgoLoading.value = false
  }
}

/** 根据当前模式推导算法 ID */
const algo = computed<string>(() => {
  if (form.mode === 'base') return DEFAULT_HIGHLEVEL_ALGO
  if (form.mode === 'analysis') return buildAlgoId(form.family, form.taskKind)
  return form.algoId
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入会话名称', trigger: 'blur' }],
}

// 弹窗打开时填入默认会话名称（关闭时不重置，避免下一次打开复用旧值）
watch(
  () => props.visible,
  (v) => {
    if (v && !form.name) form.name = buildDefaultName()
  },
)

// 切换模式时：分析类确保 family/taskKind 有效；全部模型下拉时懒加载算法列表
watch(
  () => form.mode,
  (m) => {
    if (m === 'analysis') {
      if (!familyOptions.some((o) => o.value === form.family)) form.family = 'dl'
      if (!taskKindOptions.some((o) => o.value === form.taskKind)) form.taskKind = 'afd'
    } else if (m === 'all') {
      loadAllAlgos()
    }
  },
)

function handleClose() {
  emit('update:visible', false)
  form.name = ''
  form.description = ''
  form.mode = 'base'
  form.family = 'dl'
  form.taskKind = 'afd'
  form.algoId = ''
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  if (form.mode === 'all' && !form.algoId) {
    ElMessage.warning('请选择算法')
    return
  }
  emit('confirm', {
    name: form.name.trim(),
    description: form.description.trim(),
    algo: algo.value,
  })
  // 父组件按成败控制关闭，此处不自动关闭
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="创建会话"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="会话名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入会话名称" clearable />
      </el-form-item>

      <el-form-item label="会话描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="请输入会话描述（可选）"
          resize="none"
        />
      </el-form-item>

      <el-form-item label="基础算法">
        <div class="algo-selector">
          <el-select v-model="form.mode" style="width: 100%">
            <el-option :label="baseAlgoLabel" value="base" />
            <el-option label="分析算法" value="analysis" />
            <el-option :label="allAlgoLabel" value="all" />
          </el-select>

          <template v-if="form.mode === 'analysis'">
            <el-select v-model="form.family" placeholder="请选择算法类型" style="width: 100%">
              <el-option
                v-for="opt in familyOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="form.taskKind" placeholder="请选择任务类型" style="width: 100%">
              <el-option
                v-for="opt in taskKindOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </template>

          <el-select
            v-else-if="form.mode === 'all'"
            v-model="form.algoId"
            placeholder="请选择算法"
            style="width: 100%"
            filterable
            :loading="allAlgoLoading"
          >
            <el-option v-for="id in allAlgoOptions" :key="id" :label="id" :value="id" />
          </el-select>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="props.loading">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="props.loading">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 统一表单项字号 */
.el-form :deep(.el-form-item__label) {
  font-size: 13px;
  white-space: nowrap;
}

/* 让输入框与文本域的 placeholder / 文本字体保持一致 */
.el-form :deep(.el-input__inner),
.el-form :deep(.el-textarea__inner) {
  font-size: 13px;
  font-family: inherit;
}

/* 基础算法：模式选择 + （分析类时）算法类型/任务类型三级纵向排列 */
.algo-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
</style>
