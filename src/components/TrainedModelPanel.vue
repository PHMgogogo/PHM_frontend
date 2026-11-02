<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Delete, Download, EditPen, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { trainedModelApi } from '@/api/trainedModel'
import type { TrainedModel } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const models = ref<TrainedModel[]>([])
const loading = ref(false)
const searchQuery = ref('')
const sortieFilter = ref('')

const editVisible = ref(false)
const editSubmitting = ref(false)
const editingId = ref<number | null>(null)
const editForm = reactive({
  name: '',
  description: '',
})

const sortieOptions = computed(() => {
  const seen = new Set<string>()
  return models.value
    .filter((item) => {
      if (!item.sortie_key || seen.has(item.sortie_key)) return false
      seen.add(item.sortie_key)
      return true
    })
    .map((item) => ({
      value: item.sortie_key,
      label: `${item.sortie_number || item.sortie_key}${item.flight_date ? ` · ${item.flight_date}` : ''}`,
    }))
})

const filteredModels = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return models.value.filter((item) => {
    if (sortieFilter.value && item.sortie_key !== sortieFilter.value) return false
    if (!keyword) return true
    return [
      item.name,
      item.description,
      item.sortie_number,
      item.sortie_key,
      item.aircraft_number,
      item.model_code,
      item.algorithm_id,
      item.algorithm_name,
      item.task_name,
      item.data_table_name,
    ].some((value) => value?.toLowerCase().includes(keyword))
  })
})

async function loadModels() {
  loading.value = true
  try {
    models.value = await trainedModelApi.list({
      aircraft_number: props.aircraftNumber,
      model_code: props.modelCode,
    })
  } catch (error) {
    models.value = []
    ElMessage.error('加载模型列表失败: ' + (error as Error).message)
  } finally {
    loading.value = false
  }
}

function formatSavedAt(value: string): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function dataRange(item: TrainedModel): string {
  const start = item.data_range_start
  const end = item.data_range_end
  if (start && end) {
    const startDate = start.slice(0, 10)
    const endDate = end.slice(0, 10)
    if (startDate === endDate) {
      return `${startDate.slice(5)} ${start.slice(11, 16)} ~ ${end.slice(11, 16)}`
    }
    return `${start.slice(5, 16)} ~ ${end.slice(5, 16)}`
  }
  if (start) return `${start.slice(5, 16)} ~ 架次结束`
  if (end) return `架次起始 ~ ${end.slice(5, 16)}`
  return '按架次起止时间'
}

function sourceText(item: TrainedModel): string {
  if (item.data_table_name) return item.data_table_name
  return item.source_type === 'external' ? '第三方时序数据' : '架次时序数据'
}

function openEdit(item: TrainedModel) {
  editingId.value = item.model_id
  editForm.name = item.name
  editForm.description = item.description
  editVisible.value = true
}

async function submitEdit() {
  if (!editingId.value) return
  if (!editForm.name.trim()) {
    ElMessage.warning('模型名称不能为空')
    return
  }
  editSubmitting.value = true
  try {
    const updated = await trainedModelApi.update(editingId.value, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
    })
    const index = models.value.findIndex((item) => item.model_id === updated.model_id)
    if (index >= 0) models.value[index] = updated
    editVisible.value = false
    ElMessage.success('模型信息已更新')
  } catch (error) {
    ElMessage.error('更新模型失败: ' + (error as Error).message)
  } finally {
    editSubmitting.value = false
  }
}

async function removeModel(item: TrainedModel) {
  try {
    await ElMessageBox.confirm(
      `确定删除模型“${item.name}”吗？模型文件和登记信息将一并删除。`,
      '删除模型',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await trainedModelApi.remove(item.model_id)
    models.value = models.value.filter((model) => model.model_id !== item.model_id)
    ElMessage.success('模型已删除')
  } catch (error) {
    ElMessage.error('删除模型失败: ' + (error as Error).message)
  }
}

function downloadModel(item: TrainedModel) {
  if (!item.path) {
    ElMessage.warning('该模型没有可下载的文件')
    return
  }
  window.open(trainedModelApi.downloadUrl(item.model_id), '_blank', 'noopener')
}

watch(
  () => [props.aircraftNumber, props.modelCode],
  () => loadModels(),
)

onMounted(loadModels)
</script>

<template>
  <div class="models-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">模型管理</h2>
        <p class="page-subtitle">训练完成后自动归档的模型及其架次、算法和训练数据信息</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="loadModels">刷新</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchQuery"
        class="search-input"
        clearable
        placeholder="搜索模型名称、架次、算法或备注"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="sortieFilter"
        class="sortie-filter"
        clearable
        filterable
        placeholder="全部架次"
      >
        <el-option
          v-for="option in sortieOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <span class="model-count">共 {{ filteredModels.length }} 个模型</span>
    </div>

    <div class="table-card" v-loading="loading">
      <el-table
        v-if="filteredModels.length"
        :data="filteredModels"
        row-key="model_id"
        height="100%"
        class="model-table"
      >
        <el-table-column label="模型名称" min-width="190">
          <template #default="{ row }">
            <div class="model-name">{{ row.name || '未命名模型' }}</div>
            <div v-if="row.description" class="model-note" :title="row.description">
              {{ row.description }}
            </div>
            <div class="model-version">版本 {{ row.version }}</div>
          </template>
        </el-table-column>

        <el-table-column label="所属架次数据" min-width="220">
          <template #default="{ row }">
            <div class="primary-cell">{{ row.sortie_number || row.sortie_key || '--' }}</div>
            <div class="secondary-cell">
              {{ row.flight_date || '日期未知' }} · 机号 {{ row.aircraft_number || '--' }}
            </div>
            <div class="secondary-cell">{{ sourceText(row) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="算法" min-width="190">
          <template #default="{ row }">
            <div class="primary-cell">
              {{ row.algorithm_name || row.algorithm_id || '未识别算法' }}
            </div>
            <div v-if="row.task_name" class="secondary-cell">会话：{{ row.task_name }}</div>
            <div class="secondary-cell mono">实例 {{ row.instance_id }}</div>
          </template>
        </el-table-column>

        <el-table-column label="训练数据" min-width="230">
          <template #default="{ row }">
            <div class="secondary-cell">{{ dataRange(row) }}</div>
            <div class="secondary-cell">
              数据列 {{ row.data_columns?.length || 0 }} · 标签列 {{ row.label_columns?.length || 0 }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="保存时间" width="170">
          <template #default="{ row }">
            <div class="primary-cell">{{ formatSavedAt(row.time) }}</div>
            <div class="secondary-cell">{{ formatFileSize(row.file_size) }}</div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right" align="center">
          <template #default="{ row }">
            <el-tooltip content="下载模型文件" placement="top">
              <el-button link type="primary" :icon="Download" @click="downloadModel(row)" />
            </el-tooltip>
            <el-tooltip content="编辑名称和备注" placement="top">
              <el-button link type="primary" :icon="EditPen" @click="openEdit(row)" />
            </el-tooltip>
            <el-tooltip content="删除模型" placement="top">
              <el-button link type="danger" :icon="Delete" @click="removeModel(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-else-if="!loading"
        :description="
          models.length
            ? '没有符合筛选条件的模型'
            : '暂无模型，前往时序数据查询并完成一次训练后会出现在这里'
        "
      />
    </div>

    <el-dialog v-model="editVisible" title="编辑模型信息" width="520px">
      <el-form label-width="88px">
        <el-form-item label="模型名称" required>
          <el-input v-model="editForm.name" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="模型备注">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
            placeholder="记录训练目的、参数或适用场景"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEdit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.models-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 32px 14px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #7f8c9f;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 32px 14px;
}

.search-input {
  width: 360px;
  max-width: 45%;
}

.sortie-filter {
  width: 240px;
}

.model-count {
  margin-left: auto;
  color: #8c9ab0;
  font-size: 13px;
  white-space: nowrap;
}

.table-card {
  flex: 1;
  min-height: 0;
  margin: 0 32px 32px;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  overflow: hidden;
}

.model-table {
  height: 100%;
}

.model-name,
.primary-cell {
  color: #0d1f3c;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
}

.model-note {
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  color: #62738a;
  font-size: 12px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.model-version,
.secondary-cell {
  margin-top: 2px;
  color: #8c9ab0;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
</style>
