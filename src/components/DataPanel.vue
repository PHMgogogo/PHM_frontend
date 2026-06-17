<script setup lang="ts">
import { ref, watch } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useDataMappingStore } from '@/stores/dataMapping'
import { useConfigItemStore } from '@/stores/configItem'
import { getMappings } from '@/api/aircraft'
import type { DataType, ConfigDataMapping } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
}>()

const dataMappingStore = useDataMappingStore()
const configItemStore = useConfigItemStore()

const csvFile = ref<File | null>(null)
const csvTableName = ref('')
const csvParentItemId = ref<number | undefined>(undefined)
const csvDataType = ref<DataType>('RAW')
const dataTypeOptions: { label: string; value: DataType }[] = [
  { label: '诊断数据', value: 'DIAGNOSIS' },
  { label: '评估数据', value: 'EVALUATION' },
  { label: '预测数据', value: 'PREDICTION' },
  { label: '原始数据', value: 'RAW' },
]

const uploadRef = ref()

// ---- 已上传映射记录 ----
const mappings = ref<ConfigDataMapping[]>([])
const mappingsLoading = ref(false)

const dataTypeMeta: Record<string, { label: string; color: string }> = {
  DIAGNOSIS:  { label: '诊断数据', color: '#e6a23c' },
  EVALUATION: { label: '评估数据', color: '#409eff' },
  PREDICTION: { label: '预测数据', color: '#67c23a' },
  RAW:        { label: '原始数据', color: '#909399' },
}

function formatTime(ts: string) {
  if (!ts) return '-'
  // 后端返回格式 "2026-06-01 18:31:19.000000" 或 ISO
  const s = ts.replace('T', ' ').replace('Z', '')
  return s.length >= 19 ? s.slice(0, 19) : s
}

async function fetchMappings() {
  if (!props.aircraftNumber) return
  mappingsLoading.value = true
  try {
    mappings.value = await getMappings({ aircraftNumber: props.aircraftNumber })
  } catch (e) {
    ElMessage.error('获取数据映射失败: ' + (e as Error).message)
  } finally {
    mappingsLoading.value = false
  }
}

watch(() => props.aircraftNumber, fetchMappings, { immediate: true })

function handleFileChange(file: File) {
  csvFile.value = file
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
  try {
    await dataMappingStore.uploadCsv(
      csvFile.value,
      csvTableName.value.trim(),
      props.aircraftNumber,
      csvParentItemId.value,
      csvDataType.value,
    )
    ElMessage.success(dataMappingStore.uploadResult?.message || '上传成功')
    // 重置
    csvFile.value = null
    csvTableName.value = ''
    csvParentItemId.value = undefined
    csvDataType.value = 'RAW'
    dataMappingStore.clearAnalysis()
    uploadRef.value?.clearFiles()
    // 上传成功后刷新映射列表
    fetchMappings()
  } catch {
    // 错误已在 store 中处理
  }
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

        <div class="form-row inline-fields">
          <el-form-item label="数据表名" label-width="80px">
            <el-input
              v-model="csvTableName"
              placeholder=""
              style="width: 200px"
            />
          </el-form-item>

          <el-form-item label="数据类型" label-width="80px">
            <el-select v-model="csvDataType" style="width: 160px">
              <el-option
                v-for="dt in dataTypeOptions"
                :key="dt.value"
                :label="dt.label"
                :value="dt.value"
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
            :disabled="!csvFile || !csvTableName.trim()"
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
            ⚠ {{ err }}
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

    <!-- 已上传记录 -->
    <div v-if="mappings.length > 0" class="records-section">
      <div class="section-title">
        数据上传记录
        <span class="record-count">{{ mappings.length }} 条</span>
      </div>
      <el-table
        :data="mappings"
        size="small"
        stripe
        v-loading="mappingsLoading"
        empty-text="暂无已上传数据"
        row-class-name="mapping-row"
      >
        <el-table-column prop="csvTableName" label="数据表名">
          <template #default="{ row }">
            <span class="table-name-cell">{{ row.csvTableName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="dataType" label="数据类型" width="120" align="center">
          <template #default="{ row }">
            <span
              class="data-type-tag"
              :style="{ background: dataTypeMeta[row.dataType]?.color + '18', color: dataTypeMeta[row.dataType]?.color, borderColor: dataTypeMeta[row.dataType]?.color + '40' }"
            >
              {{ dataTypeMeta[row.dataType]?.label || row.dataType }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="dataTime" label="数据时间" width="180" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.dataTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上传时间" width="180" align="center">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行操作" width="160" align="center">
          <template #default>
            <div class="action-btns">
              <el-button type="primary" text size="small">去训练</el-button>
              <el-button type="success" text size="small">去推理</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 空状态 -->
    <div v-else class="records-section empty-state">
      <div class="section-title">数据上传记录</div>
      <div class="empty-hint">
        <div class="empty-icon">📋</div>
        <p>暂无已上传的 CSV 数据</p>
        <p class="empty-sub">上传 CSV 文件后，数据上传记录将在此展示</p>
      </div>
    </div>
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

.inline-fields {
  display: flex;
  gap: 24px;
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

.action-btns {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.data-type-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
  line-height: 1.6;
}

.time-text {
  font-size: 13px;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
}

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
