<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  ALGO_FAMILY_OPTIONS,
  ALGO_TASK_KIND_OPTIONS,
  BASE_ALGO_LABEL,
  DEFAULT_HIGHLEVEL_ALGO,
  buildAlgoId,
} from '@/api/instance'
import type { HighLevelAlgo, AlgoFamily, AlgoTaskKind } from '@/api/instance'

const props = defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (
    e: 'confirm',
    data: { name: string; description: string; algo: HighLevelAlgo },
  ): void
}>()

/** 生成默认会话名称，如「会话 20260914-1530」 */
function buildDefaultName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `会话 ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
  /** 是否使用基础模型；true 时无需选择算法类型/任务类型 */
  isBaseModel: true,
  family: 'dl' as AlgoFamily,
  taskKind: 'afd' as AlgoTaskKind,
})

const familyOptions = ALGO_FAMILY_OPTIONS
const taskKindOptions = ALGO_TASK_KIND_OPTIONS
const baseAlgoLabel = BASE_ALGO_LABEL

/** 根据当前选择推导算法 ID */
const algo = computed<HighLevelAlgo>(() =>
  form.isBaseModel ? DEFAULT_HIGHLEVEL_ALGO : buildAlgoId(form.family, form.taskKind),
)

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

// 选择「基础模型」后重新切回分析类时，确保遗留的 family/taskKind 仍有效
watch(
  () => form.isBaseModel,
  (isBase) => {
    if (isBase) return
    if (!familyOptions.some((o) => o.value === form.family)) form.family = 'dl'
    if (!taskKindOptions.some((o) => o.value === form.taskKind)) form.taskKind = 'afd'
  },
)

function handleClose() {
  emit('update:visible', false)
  form.name = ''
  form.description = ''
  form.isBaseModel = true
  form.family = 'dl'
  form.taskKind = 'afd'
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
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
          <el-select v-model="form.isBaseModel" style="width: 100%">
            <el-option :label="baseAlgoLabel" :value="true" />
            <el-option label="分析算法" :value="false" />
          </el-select>

          <template v-if="!form.isBaseModel">
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
