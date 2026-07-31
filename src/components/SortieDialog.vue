<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (
    e: 'confirm',
    data: {
      sortieNumber: string
      flightDate: string
      startTime: string
      endTime: string
    },
  ): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  sortieNumber: '',
  flightDate: '',
  startTime: '',
  endTime: '',
})

const rules: FormRules = {
  sortieNumber: [{ required: true, message: '请输入架次号', trigger: 'blur' }],
}

function handleClose() {
  emit('update:visible', false)
  form.sortieNumber = ''
  form.flightDate = ''
  form.startTime = ''
  form.endTime = ''
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  emit('confirm', {
    sortieNumber: form.sortieNumber.trim(),
    flightDate: form.flightDate,
    startTime: form.startTime,
    endTime: form.endTime,
  })
  // 父组件按成败控制关闭，此处不自动关闭
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="添加架次"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="架次号" prop="sortieNumber">
        <el-input v-model="form.sortieNumber" placeholder="如 CA1234-20260723" clearable />
      </el-form-item>

      <el-form-item label="飞行日期">
        <el-date-picker
          v-model="form.flightDate"
          type="date"
          placeholder="选择飞行日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="开始时间">
        <el-time-picker
          v-model="form.startTime"
          placeholder="选择开始时间"
          value-format="HH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="结束时间">
        <el-time-picker
          v-model="form.endTime"
          placeholder="选择结束时间"
          value-format="HH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose" :disabled="loading">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="loading">添加</el-button>
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
</style>
