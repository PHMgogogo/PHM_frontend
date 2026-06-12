<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

const props = defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'confirm', data: { name: string; description: string }): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
}

function handleClose() {
  emit('update:visible', false)
  form.name = ''
  form.description = ''
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
  })
  // 父组件按成败控制关闭，此处不自动关闭
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="创建任务"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入任务名称" clearable />
      </el-form-item>

      <el-form-item label="任务描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="请输入任务描述（可选）"
          resize="none"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="props.loading">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="props.loading">创建</el-button>
    </template>
  </el-dialog>
</template>
