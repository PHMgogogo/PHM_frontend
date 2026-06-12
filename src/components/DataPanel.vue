<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useDataMappingStore } from '@/stores/dataMapping'
import { useConfigItemStore } from '@/stores/configItem'
import type { DataType } from '@/types/entities'

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
    if (result.errors && result.errors.length > 0) {
      ElMessage.warning(`数据校验发现 ${result.errors.length} 个问题`)
    } else {
      ElMessage.success(`共 ${result.rowCount} 行，${result.columns.length} 列，校验通过`)
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
          <span>分析结果：{{ dataMappingStore.previewResult.rowCount }} 行，{{ dataMappingStore.previewResult.columns.length }} 列</span>
        </div>
        <div v-if="dataMappingStore.previewResult.errors?.length" class="preview-errors">
          <div
            v-for="(err, i) in dataMappingStore.previewResult.errors"
            :key="i"
            class="preview-error-item"
          >
            ⚠ {{ err }}
          </div>
        </div>
        <el-table
          :data="dataMappingStore.previewResult.columns"
          size="small"
          max-height="200"
        >
          <el-table-column prop="columnName" label="列名" />
          <el-table-column prop="columnType" label="列类型" />
          <el-table-column prop="suggestedMapping" label="建议映射" />
        </el-table>
      </div>
    </div>

    <!-- 已上传记录 -->
    <div v-if="dataMappingStore.csvRecords.length > 0" class="records-section">
      <div class="section-title">已上传数据</div>
      <el-table :data="dataMappingStore.csvRecords" size="small">
        <el-table-column prop="tableName" label="表名" />
        <el-table-column prop="dataType" label="数据类型" width="100" />
        <el-table-column prop="uploadedAt" label="上传时间" width="180">
          <template #default="{ row }">
            {{ row.uploadedAt.slice(0, 19).replace('T', ' ') }}
          </template>
        </el-table-column>
      </el-table>
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

.records-section {
  margin-top: 8px;
}
</style>
