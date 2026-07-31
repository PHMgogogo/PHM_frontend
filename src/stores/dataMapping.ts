import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as csvApi from '@/api/csv'
import type { CsvPreviewResponse } from '@/types/entities'

export const useDataMappingStore = defineStore('dataMapping', () => {
  // CSV 上传流程状态
  const uploading = ref(false)
  const analyzing = ref(false)
  const dropping = ref(false)
  const uploadResult = ref<{ success: boolean; message?: string } | null>(null)

  // 列分析结果
  const columnAnalysis = ref<Record<string, string>>({})
  const previewResult = ref<CsvPreviewResponse | null>(null)

  // 已上传的 CSV 记录（当前单机的）
  const csvRecords = ref<Array<{
    tableName: string
    sortieId: number
    parentItemId?: number
    uploadedAt: string
  }>>([])

  async function analyzeCsv(file: File) {
    analyzing.value = true
    try {
      columnAnalysis.value = await csvApi.analyzeColumns(file)
      return columnAnalysis.value
    } finally {
      analyzing.value = false
    }
  }

  async function previewCsv(file: File) {
    analyzing.value = true
    try {
      previewResult.value = await csvApi.previewCsv(file)
      return previewResult.value
    } finally {
      analyzing.value = false
    }
  }

  async function uploadCsv(
    file: File,
    tableName: string,
    sortieId: number,
    parentItemId?: number,
  ) {
    uploading.value = true
    uploadResult.value = null
    try {
      const res = await csvApi.uploadCsv(file, tableName, sortieId, parentItemId)
      uploadResult.value = { success: true, message: res.message || '上传成功' }
      csvRecords.value.push({
        tableName,
        sortieId,
        parentItemId,
        uploadedAt: new Date().toISOString(),
      })
      return res
    } catch (e) {
      uploadResult.value = { success: false, message: (e as Error).message }
      throw e
    } finally {
      uploading.value = false
    }
  }

  function clearAnalysis() {
    columnAnalysis.value = {}
    previewResult.value = null
  }

  /**
   * 删除指定的 CSV 数据表。
   * @param csvTableName 映射记录中的表名（不含 `csv_` 前缀）
   */
  async function dropCsvTable(csvTableName: string) {
    dropping.value = true
    try {
      const res = await csvApi.dropCsvTable(`csv_${csvTableName}`)
      // 同步移除本地缓存记录
      csvRecords.value = csvRecords.value.filter((r) => r.tableName !== csvTableName)
      return res
    } finally {
      dropping.value = false
    }
  }

  function clearUploadResult() {
    uploadResult.value = null
  }

  return {
    uploading,
    analyzing,
    dropping,
    uploadResult,
    columnAnalysis,
    previewResult,
    csvRecords,
    analyzeCsv,
    previewCsv,
    uploadCsv,
    dropCsvTable,
    clearAnalysis,
    clearUploadResult,
  }
})
