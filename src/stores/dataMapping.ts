import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as csvApi from '@/api/csv'
import type { CsvPreviewResponse } from '@/types/entities'

export const useDataMappingStore = defineStore('dataMapping', () => {
  // CSV 上传流程状态
  const uploading = ref(false)
  const analyzing = ref(false)
  const uploadResult = ref<{ success: boolean; message?: string } | null>(null)

  // 列分析结果
  const columnAnalysis = ref<Record<string, string>>({})
  const previewResult = ref<CsvPreviewResponse | null>(null)

  // 已上传的 CSV 记录（当前单机的）
  const csvRecords = ref<Array<{
    tableName: string
    aircraftNumber: string
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
    aircraftNumber: string,
    parentItemId?: number,
  ) {
    uploading.value = true
    uploadResult.value = null
    try {
      const res = await csvApi.uploadCsv(file, tableName, aircraftNumber, parentItemId)
      uploadResult.value = { success: true, message: res.message || '上传成功' }
      csvRecords.value.push({
        tableName,
        aircraftNumber,
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

  function clearUploadResult() {
    uploadResult.value = null
  }

  return {
    uploading,
    analyzing,
    uploadResult,
    columnAnalysis,
    previewResult,
    csvRecords,
    analyzeCsv,
    previewCsv,
    uploadCsv,
    clearAnalysis,
    clearUploadResult,
  }
})
