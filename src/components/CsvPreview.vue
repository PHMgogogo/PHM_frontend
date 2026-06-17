<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    file: File | null
    maxRows?: number
  }>(),
  { maxRows: 100 },
)

const headers = ref<string[]>([])
const rows = ref<string[][]>([])
const totalRows = ref(0)
const error = ref<string | null>(null)

// ---- CSV 解析 ----

/** 解析一行 CSV（处理双引号包裹字段） */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        // 双引号转义："" → "
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

async function parse(file: File) {
  headers.value = []
  rows.value = []
  totalRows.value = 0
  error.value = null

  try {
    let text = await file.text()

    // 处理 BOM
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }

    // 按行分割
    const lines = text.split(/\r?\n/)

    // 过滤尾部空行
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop()
    }

    if (lines.length === 0) {
      error.value = 'CSV 文件为空'
      return
    }

    // 第一行：表头
    headers.value = parseCSVLine(lines[0])

    // 数据行
    const dataLines = lines.slice(1)
    totalRows.value = dataLines.length

    const preview = dataLines.slice(0, props.maxRows)
    rows.value = preview.map((line) => parseCSVLine(line))
  } catch (e) {
    error.value = 'CSV 解析失败: ' + (e as Error).message
  }
}

watch(
  () => props.file,
  (f) => {
    if (f) {
      parse(f)
    } else {
      headers.value = []
      rows.value = []
      totalRows.value = 0
      error.value = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="file" class="csv-preview">
    <!-- 错误状态 -->
    <div v-if="error" class="csv-preview-error">{{ error }}</div>

    <!-- 正常状态 -->
    <template v-else-if="headers.length > 0">
      <div class="csv-preview-stats">
        {{ totalRows }} 行 × {{ headers.length }} 列
      </div>
      <div class="csv-preview-table-wrap">
        <el-table :data="rows" size="small" border stripe max-height="180">
          <el-table-column
            v-for="(h, i) in headers"
            :key="i"
            :label="h"
            :prop="String(i)"
            show-overflow-tooltip
          />
        </el-table>
      </div>
    </template>

    <!-- 加载中 -->
    <div v-else class="csv-preview-placeholder">正在解析...</div>
  </div>
</template>

<style scoped>
.csv-preview {
  width: 100%;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: #fafbfd;
  border: 1px solid #e0e8f5;
  border-radius: 6px;
  box-sizing: border-box;
}

.csv-preview-stats {
  font-size: 13px;
  color: #3a4a5c;
  margin-bottom: 6px;
  font-weight: 500;
  flex-shrink: 0;
}

.csv-preview-table-wrap {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.csv-preview-error,
.csv-preview-placeholder {
  font-size: 13px;
  color: #8c9ab0;
}

.csv-preview-error {
  color: #e6a23c;
}
</style>
