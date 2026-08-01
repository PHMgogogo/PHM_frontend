<script setup lang="ts">
import { ref, watch } from 'vue'
import { Upload, Warning } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataMappingStore } from '@/stores/dataMapping'
import { useConfigItemStore } from '@/stores/configItem'
import { getMappings, getSorties, addSortie, deleteSortie } from '@/api/aircraft'
import TrainingDialog from '@/components/TrainingDialog.vue'
import InferingDialog from '@/components/InferingDialog.vue'
import SortieDialog from '@/components/SortieDialog.vue'
import type { ConfigDataMapping, Sortie } from '@/types/entities'

type SortieRow = Sortie & { mappings: ConfigDataMapping[] }

const props = defineProps<{
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'navigate-to-tasks'): void
}>()

const dataMappingStore = useDataMappingStore()
const configItemStore = useConfigItemStore()

const csvFile = ref<File | null>(null)
const csvTableName = ref('')
const csvSortieId = ref<number | undefined>(undefined)
const csvParentItemId = ref<number | undefined>(undefined)
const uploadRef = ref()

// ---- 架次列表（每个架次可关联多张 CSV 数据表） ----
const sorties = ref<Sortie[]>([])
const sortieRows = ref<SortieRow[]>([])
const sortiesLoading = ref(false)
const addingSortie = ref(false)
const deletingSortie = ref(false)

function formatTime(ts?: string) {
  if (!ts) return '-'
  // 后端返回格式 "2026-06-01 18:31:19.000000" 或 ISO
  const s = ts.replace('T', ' ').replace('Z', '')
  return s.length >= 19 ? s.slice(0, 19) : s
}

async function loadSorties() {
  if (!props.aircraftNumber) return
  sortiesLoading.value = true
  try {
    const list = await getSorties(props.aircraftNumber)
    sorties.value = list
    // 一个架次可关联多张 CSV 数据表：并联查询每个架次的全部映射
    const enriched = await Promise.all(
      list.map(async (s) => {
        try {
          const maps = await getMappings({ sortieId: s.sortieId })
          return { ...s, mappings: maps } as SortieRow
        } catch {
          return { ...s, mappings: [] } as SortieRow
        }
      }),
    )
    sortieRows.value = enriched
  } catch (e) {
    ElMessage.error('获取架次列表失败: ' + (e as Error).message)
    sorties.value = []
    sortieRows.value = []
  } finally {
    sortiesLoading.value = false
  }
}

watch(
  () => props.aircraftNumber,
  () => {
    csvSortieId.value = undefined
    loadSorties()
  },
  { immediate: true },
)

function handleFileChange(file: File) {
  csvFile.value = file
  // 自动填充数据表名为文件名前缀（去除扩展名）
  csvTableName.value = file.name.replace(/\.[^.]+$/, '')
}

async function analyzeFile() {
  if (!csvFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  try {
    const result = await dataMappingStore.previewCsv(csvFile.value)
    const v = result.validation
    if (v.errors && v.errors.length > 0) {
      ElMessage.warning(`数据校验发现 ${v.errors.length} 个问题`)
    } else {
      ElMessage.success(`共 ${v.totalRows} 行（有效 ${v.validRows} 行），${v.columns.length} 列，校验通过`)
    }
  } catch (e) {
    ElMessage.error('分析失败: ' + (e as Error).message)
  }
}

async function handleCsvUpload() {
  if (!csvFile.value || !csvTableName.value.trim()) {
    ElMessage.warning('请填写表名并选择文件')
    return
  }
  if (csvSortieId.value === undefined) {
    ElMessage.warning('请先选择关联架次')
    return
  }
  try {
    await dataMappingStore.uploadCsv(
      csvFile.value,
      csvTableName.value.trim(),
      csvSortieId.value,
      csvParentItemId.value,
    )
    ElMessage.success(dataMappingStore.uploadResult?.message || '上传成功')
    // 重置
    csvFile.value = null
    csvTableName.value = ''
    csvParentItemId.value = undefined
    dataMappingStore.clearAnalysis()
    uploadRef.value?.clearFiles()
    // 上传成功后刷新架次列表（含映射）
    loadSorties()
  } catch {
    // 错误已在 store 中处理
  }
}

// ---- 添加架次对话框 ----
const sortieDialogVisible = ref(false)

async function onSortieConfirm(payload: {
  sortieNumber: string
  flightDate: string
  startTime: string
  endTime: string
}) {
  addingSortie.value = true
  try {
    await addSortie({ ...payload, aircraftNumber: props.aircraftNumber })
    ElMessage.success('架次添加成功')
    sortieDialogVisible.value = false
    loadSorties()
  } catch (e) {
    ElMessage.error('添加架次失败: ' + (e as Error).message)
  } finally {
    addingSortie.value = false
  }
}

async function handleDeleteSortie(row: SortieRow) {
  try {
    await ElMessageBox.confirm(
      row.mappings.length
        ? `确定删除架次「${row.sortieNumber || row.sortieId}」？该架次关联的 ${row.mappings.length} 张数据表将一并删除，且不可恢复。`
        : `确定删除架次「${row.sortieNumber || row.sortieId}」？该操作不可恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  deletingSortie.value = true
  try {
    const res = await deleteSortie(row.sortieId)
    ElMessage.success(res?.message || '删除成功')
    loadSorties()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e as Error).message)
  } finally {
    deletingSortie.value = false
  }
}

/**
 * 仅删除某张 CSV 数据表，保留架次本身（一个架次可有多张表，故需指定 mapping）。
 * 复用 dataMappingStore.dropCsvTable（自动补 `csv_` 前缀 + dropping 加载态）。
 */
async function handleDropTable(row: SortieRow, mapping: ConfigDataMapping) {
  const tableName = mapping.csvTableName
  try {
    await ElMessageBox.confirm(
      `确定删除数据表「${tableName}」并保留架次「${row.sortieNumber || row.sortieId}」？此操作不可恢复。`,
      '确认删表',
      { confirmButtonText: '删表', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const res = await dataMappingStore.dropCsvTable(tableName)
    ElMessage.success(res?.message || '数据表已删除')
    loadSorties()
  } catch (e) {
    ElMessage.error('删表失败: ' + (e as Error).message)
  }
}

// ---- 去训练对话框 ----
const trainingDialogVisible = ref(false)
const trainingMapping = ref<ConfigDataMapping | null>(null)

function handleGoToTraining(mapping: ConfigDataMapping) {
  trainingMapping.value = mapping
  trainingDialogVisible.value = true
}

function onTrainingSuccess() {
  trainingDialogVisible.value = false
  emit('navigate-to-tasks')
}

// ---- 去推理对话框 ----
const inferingDialogVisible = ref(false)
const inferingMapping = ref<ConfigDataMapping | null>(null)

function handleGoToInfering(mapping: ConfigDataMapping) {
  inferingMapping.value = mapping
  inferingDialogVisible.value = true
}

function onInferingSuccess() {
  inferingDialogVisible.value = false
  emit('navigate-to-tasks')
}
</script>

<template>
  <div class="page-inner">
    <div class="page-inner-header">
      <h2 class="inner-title">数据管理</h2>
    </div>

    <!-- CSV 上传区域 -->
    <div class="upload-section">
      <div class="section-title">CSV 数据上传</div>
      <div class="upload-form">
        <div class="form-row">
          <el-form-item label="CSV 文件" label-width="80px">
            <el-upload
              ref="uploadRef"
              :auto-upload="false"
              :limit="1"
              accept=".csv"
              :on-change="(f: any) => handleFileChange(f.raw)"
              drag
            >
              <el-icon class="el-icon--upload"><Upload /></el-icon>
              <div class="el-upload__text">拖拽或点击上传 CSV 文件</div>
            </el-upload>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="数据表名" label-width="80px">
            <el-input
              v-model="csvTableName"
              placeholder=""
              style="width: 200px"
            />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="关联架次" label-width="80px">
            <el-select
              v-model="csvSortieId"
              placeholder="选择架次（必选）"
              clearable
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="s in sorties"
                :key="s.sortieId"
                :label="`${s.sortieNumber || s.sortieId}（${s.flightDate || '未填日期'}）`"
                :value="s.sortieId"
              />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="关联构型" label-width="80px">
            <el-select
              v-model="csvParentItemId"
              placeholder="选择构型项目（可选）"
              clearable
              style="width: 100%"
              filterable
            >
              <el-option
                v-for="item in configItemStore.selectList"
                :key="item.itemId"
                :label="item.label"
                :value="item.itemId"
              />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-actions">
          <el-button @click="analyzeFile" :loading="dataMappingStore.analyzing">
            分析预览
          </el-button>
          <el-button
            type="primary"
            @click="handleCsvUpload"
            :loading="dataMappingStore.uploading"
            :disabled="!csvFile || !csvTableName.trim() || csvSortieId === undefined"
          >
            <el-icon><Upload /></el-icon> 上传
          </el-button>
        </div>
      </div>

      <!-- 预览结果 -->
      <div v-if="dataMappingStore.previewResult" class="preview-panel">
        <div class="preview-header">
          <span>
            共 {{ dataMappingStore.previewResult.validation.totalRows }} 行，
            有效 {{ dataMappingStore.previewResult.validation.validRows }} 行，
            共 {{ dataMappingStore.previewResult.validation.columns.length }} 列
          </span>
          <span v-if="!dataMappingStore.previewResult.validation.valid" class="preview-invalid-tag">校验未通过</span>
        </div>
        <div v-if="dataMappingStore.previewResult.validation.errors?.length" class="preview-errors">
          <div
            v-for="(err, i) in dataMappingStore.previewResult.validation.errors"
            :key="i"
            class="preview-error-item"
          >
            <el-icon color="#EF4444"><Warning /></el-icon> {{ err }}
          </div>
        </div>
        <el-table
          :data="Object.entries(dataMappingStore.previewResult.analysis.columnTypes)"
          size="small"
          max-height="200"
        >
          <el-table-column prop="0" label="列名" />
          <el-table-column prop="1" label="SQL 类型" />
        </el-table>
      </div>
    </div>

    <!-- 架次管理（每个架次可关联多张 CSV 数据表，展开查看） -->
    <div class="records-section">
      <div class="section-title sorties-title">
        <span>
          架次管理
          <span class="record-count">{{ sortieRows.length }} 条</span>
        </span>
        <el-button type="primary" size="small" @click="sortieDialogVisible = true">
          + 添加架次
        </el-button>
      </div>
      <el-table
        v-if="sortieRows.length > 0"
        :data="sortieRows"
        size="small"
        stripe
        row-key="sortieId"
        v-loading="sortiesLoading"
        empty-text="暂无架次"
      >
        <!-- 展开行：该架次关联的全部 CSV 数据表（一个架次可有多张表） -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="row.mappings.length" class="sub-table-wrap">
              <el-table :data="row.mappings" size="small" border>
                <el-table-column label="数据表名" min-width="180">
                  <template #default="{ row: m }">
                    <span class="table-name-cell">{{ m.csvTableName }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="上传时间" width="180" align="center">
                  <template #default="{ row: m }">
                    <span class="time-text">{{ formatTime(m.createdAt) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="240" align="center">
                  <template #default="{ row: m }">
                    <div class="action-btns">
                      <el-button type="primary" text size="small" @click="handleGoToTraining(m)">
                        去训练
                      </el-button>
                      <el-button type="success" text size="small" @click="handleGoToInfering(m)">
                        去推理
                      </el-button>
                      <el-button
                        type="danger"
                        text
                        size="small"
                        :loading="dataMappingStore.dropping"
                        @click="handleDropTable(row, m)"
                      >
                        删表
                      </el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div v-else class="no-data-tag sub-empty">该架次暂无数据表</div>
          </template>
        </el-table-column>

        <el-table-column prop="sortieNumber" label="架次号" min-width="140">
          <template #default="{ row }">
            <span class="table-name-cell">{{ row.sortieNumber || row.sortieId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="flightDate" label="飞行日期" width="120" align="center" />
        <el-table-column label="起止时间" width="180" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ row.startTime || '--' }} ~ {{ row.endTime || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="数据表" min-width="140">
          <template #default="{ row }">
            <span v-if="row.mappings.length" class="table-count">
              {{ row.mappings.length }} 个数据表
            </span>
            <span v-else class="no-data-tag">暂无数据</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button
              type="danger"
              text
              size="small"
              :loading="deletingSortie"
              @click="handleDeleteSortie(row)"
            >
              删除架次
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态 -->
      <div v-else class="empty-hint">
        <div class="empty-icon">🛫</div>
        <p>暂无架次</p>
        <p class="empty-sub">点击上方「添加架次」开始管理飞行任务与数据</p>
      </div>
    </div>

    <!-- 添加架次对话框 -->
    <SortieDialog
      v-model:visible="sortieDialogVisible"
      :loading="addingSortie"
      @confirm="onSortieConfirm"
    />

    <!-- 去训练对话框 -->
    <TrainingDialog
      v-model="trainingDialogVisible"
      :mapping="trainingMapping"
      :aircraft-number="aircraftNumber"
      @success="onTrainingSuccess"
      @navigate-to-tasks="emit('navigate-to-tasks')"
    />

    <!-- 去推理对话框 -->
    <InferingDialog
      v-model="inferingDialogVisible"
      :mapping="inferingMapping"
      :aircraft-number="aircraftNumber"
      @success="onInferingSuccess"
      @navigate-to-tasks="emit('navigate-to-tasks')"
    />
  </div>
</template>

<style scoped>
.page-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 32px;
  gap: 16px;
  overflow-y: auto;
}

.page-inner-header {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.inner-title {
  font-size: 18px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #3a4a5c;
  margin-bottom: 12px;
}

.upload-section {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid #e0e8f5;
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  width: 100%;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.preview-panel {
  margin-top: 16px;
  border: 1px solid #d4e3fb;
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  background: #f0f5ff;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #1a6cf0;
}

.preview-errors {
  padding: 8px 12px;
  background: #fff8f0;
}

.preview-error-item {
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.8;
}

.preview-invalid-tag {
  font-size: 12px;
  color: #f56c6c;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
  padding: 1px 8px;
  margin-left: 12px;
}

.records-section {
  margin-top: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid #e0e8f5;
}

.sorties-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-count {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 8px;
}

.table-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.no-data-tag {
  font-size: 12px;
  color: #c0c4cc;
}

.sub-table-wrap {
  padding: 6px 16px 6px 48px;
}

.sub-empty {
  padding-left: 48px;
}

.table-count {
  font-size: 13px;
  color: #1a6cf0;
  font-weight: 500;
}

.action-btns {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.time-text {
  font-size: 13px;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

/* 空状态 */
.empty-hint {
  text-align: center;
  padding: 32px 16px 20px;
  color: #909399;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.6;
}

.empty-hint p {
  margin: 4px 0;
  font-size: 14px;
}

.empty-sub {
  font-size: 12px !important;
  color: #c0c4cc;
}
</style>
