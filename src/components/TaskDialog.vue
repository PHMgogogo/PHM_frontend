<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

const props = defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'confirm', data: { name: string; description: string; isGlobal: boolean }): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
  isGlobal: false,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入算法名称', trigger: 'blur' }],
}

function handleClose() {
  emit('update:visible', false)
  form.name = ''
  form.description = ''
  form.isGlobal = false
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
    isGlobal: form.isGlobal,
  })
  // 父组件按成败控制关闭，此处不自动关闭
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="创建算法"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="算法名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入算法名称" clearable />
      </el-form-item>

      <el-form-item label="算法描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="请输入算法描述（可选）"
          resize="none"
        />
      </el-form-item>

      <el-form-item label="算法可见性">
        <el-switch v-model="form.isGlobal" />
        <span class="visibility-hint">{{ form.isGlobal ? '全局可见' : '当前任务可见' }}</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="props.loading">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="props.loading">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 统一三个表单项的字号，并避免「算法可见性」标签换行 */
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

.visibility-hint {
  margin-left: 10px;
  font-size: 13px;
  color: #8c9ab0;
}
</style>
