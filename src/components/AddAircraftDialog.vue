<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import { ElMessage } from 'element-plus'
import type { AircraftStatus } from '@/types/entities'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'created'): void
}>()

const store = useAircraftStore()

const STATUS_OPTIONS: { label: string; value: AircraftStatus }[] = [
  { label: '活跃', value: 'active' },
  { label: '已退役', value: 'retired' },
  { label: '维护中', value: 'maintenance' },
]

const form = reactive({
  aircraftNumber: '',
  modelCode: '',
  airline: '',
  configVersion: '',
  status: 'active' as AircraftStatus,
})

const formRef = ref()
const rules = {
  aircraftNumber: [{ required: true, message: '请输入机号/注册号', trigger: 'blur' }],
  modelCode: [{ required: true, message: '请选择构型', trigger: 'change' }],
}

// ---- 新建构型 ----
const showNewModel = ref(false)
const newModelForm = reactive({
  modelCode: '',
  manufacturer: '',
  description: '',
})
const newModelRef = ref()
const newModelRules = {
  modelCode: [{ required: true, message: '请输入构型代码', trigger: 'blur' }],
}

async function submitNewModel() {
  try {
    await newModelRef.value?.validate()
  } catch {
    return
  }
  await store.createModel({
    modelCode: newModelForm.modelCode.trim(),
    manufacturer: newModelForm.manufacturer.trim(),
    description: newModelForm.description.trim(),
  })
  ElMessage.success(`构型"${newModelForm.modelCode}"已创建`)
  form.modelCode = newModelForm.modelCode
  newModelForm.modelCode = ''
  newModelForm.manufacturer = ''
  newModelForm.description = ''
  showNewModel.value = false
}

onMounted(() => {
  store.fetchModels()
})

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  await store.createAircraft({
    aircraftNumber: form.aircraftNumber.trim(),
    modelCode: form.modelCode,
    airline: form.airline.trim(),
    configVersion: form.configVersion.trim(),
    status: form.status,
  })
  ElMessage.success('飞行器已添加')
  emit('created')
  handleClose()
}

function handleClose() {
  emit('update:visible', false)
  form.aircraftNumber = ''
  form.modelCode = ''
  form.airline = ''
  form.configVersion = ''
  form.status = 'active'
  showNewModel.value = false
  formRef.value?.clearValidate()
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="添加飞行器"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="机号/注册号" prop="aircraftNumber">
        <el-input v-model="form.aircraftNumber" placeholder="例：B-1234" clearable />
      </el-form-item>

      <el-form-item label="构型" prop="modelCode">
        <div class="model-select-row">
          <el-select
            v-model="form.modelCode"
            placeholder="请选择构型"
            style="flex: 1"
            filterable
          >
            <el-option
              v-for="m in store.models"
              :key="m.modelCode"
              :label="`${m.modelCode}${m.manufacturer ? ' — ' + m.manufacturer : ''}`"
              :value="m.modelCode"
            />
          </el-select>
          <el-button
            type="primary"
            plain
            @click="showNewModel = !showNewModel"
          >
            {{ showNewModel ? '收起' : '新建构型' }}
          </el-button>
        </div>
      </el-form-item>

      <!-- 新建构型面板 -->
      <template v-if="showNewModel">
        <el-form
          ref="newModelRef"
          :model="newModelForm"
          :rules="newModelRules"
          label-width="100px"
          class="new-model-panel"
        >
          <el-form-item label="构型代码" prop="modelCode">
            <el-input v-model="newModelForm.modelCode" placeholder="例：B737-800" />
          </el-form-item>
          <el-form-item label="制造商">
            <el-input v-model="newModelForm.manufacturer" placeholder="例：Boeing" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="newModelForm.description" placeholder="例：波音737-800" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="small" @click="submitNewModel">
              保存构型
            </el-button>
          </el-form-item>
        </el-form>
      </template>

      <el-form-item label="所属航司">
        <el-input v-model="form.airline" placeholder="例：中国国航" clearable />
      </el-form-item>

      <el-form-item label="构型版本">
        <el-input v-model="form.configVersion" placeholder="例：V1.0" clearable />
      </el-form-item>

      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option
            v-for="s in STATUS_OPTIONS"
            :key="s.value"
            :label="s.label"
            :value="s.value"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.model-select-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.new-model-panel {
  margin: -8px 0 8px;
  padding: 12px 16px 4px 12px;
  border: 1px solid #d4e3fb;
  border-radius: 8px;
  background: #f6f9ff;
}
</style>
