<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAircraftStore } from '@/stores/aircraft'
import { isLocalSource } from '@/utils/aircraft-source'
import ModelCard from '@/components/ModelCard.vue'
import type { AircraftModel } from '@/types/entities'

const aircraftStore = useAircraftStore()

const searchQuery = ref('')
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  modelCode: '',
  manufacturer: '',
  description: '',
})

const rules: FormRules = {
  modelCode: [{ required: true, message: '请输入机型编码', trigger: 'blur' }],
}

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return aircraftStore.models
  return aircraftStore.models.filter((m) =>
    [m.modelCode, m.manufacturer, m.description, m.source].some(
      (v) => v && v.toLowerCase().includes(q),
    ),
  )
})

const localModelCount = computed(
  () => aircraftStore.models.filter((model) => isLocalSource(model.source)).length,
)

onMounted(() => {
  aircraftStore.fetchModels()
})

function openCreate() {
  form.modelCode = ''
  form.manufacturer = ''
  form.description = ''
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

async function submitModel() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await aircraftStore.createModel({
      modelCode: form.modelCode.trim(),
      manufacturer: form.manufacturer.trim(),
      description: form.description.trim(),
      source: 'local',
    })
    ElMessage.success('本地机型已新增')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error((e as Error).message || '新增机型失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(model: AircraftModel) {
  if (!isLocalSource(model.source)) return

  try {
    await ElMessageBox.confirm(
      `确定删除本地机型「${model.modelCode}」吗？如该机型下已有单机或构型，后端会拒绝删除。`,
      '删除机型',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await aircraftStore.deleteModel(model.modelCode)
    ElMessage.success('本地机型已删除')
  } catch (e) {
    ElMessage.error((e as Error).message || '删除机型失败')
  }
}
</script>

<template>
  <div class="model-page">
    <div class="page-header">
      <h2 class="page-title">机型管理</h2>
    </div>

    <!-- 顶部功能区 -->
    <div class="toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索机型编码、生产厂商或描述..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增本地机型</el-button>
      <span class="total-count">
        本地 {{ localModelCount }} 个 / 全部 {{ aircraftStore.models.length }} 个
      </span>
    </div>

    <!-- 卡片区：外源机型编码带 :modelId 后缀，可能出现重复 modelCode，key 需带下标 -->
    <div class="card-grid" v-loading="aircraftStore.modelsLoading">
      <ModelCard
        v-for="(model, idx) in filteredModels"
        :key="`${model.modelCode}-${idx}`"
        :model="model"
        @delete="handleDelete"
      />
      <div v-if="!aircraftStore.modelsLoading && filteredModels.length === 0" class="empty-state">
        <span class="empty-icon">🗂️</span>
        <p>暂无匹配的机型</p>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="新增本地机型"
      width="480px"
      :close-on-click-modal="false"
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="机型编码" prop="modelCode">
          <el-input
            v-model="form.modelCode"
            placeholder="例：B737-800"
            maxlength="100"
            clearable
          />
        </el-form-item>
        <el-form-item label="生产厂商" prop="manufacturer">
          <el-input
            v-model="form.manufacturer"
            placeholder="例：Boeing"
            maxlength="100"
            clearable
          />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入机型描述"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitModel">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.model-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 24px 32px 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 32px 8px;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.total-count {
  font-size: 13px;
  color: #8c9ab0;
  white-space: nowrap;
  margin-left: auto;
}

.card-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0 32px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-content: start;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #bcc5d0;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 15px;
  margin: 0;
}
</style>
