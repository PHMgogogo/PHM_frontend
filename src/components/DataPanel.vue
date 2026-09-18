<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useDataMappingStore } from '@/stores/dataMapping'
import { getMappings, getSorties } from '@/api/aircraft'
import { hasLocalSortieId } from '@/utils/aircraft-source'
import { defaultCsvTableName } from '@/utils/csvUpload'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
  /**
   * 整台只读：隐藏上传 / 新增架次 / 训练推理删表等本地写操作。
   * 三方单机的工作台已摘掉「数据管理」菜单（三方架次没有本地 config_data_mapping），
   * 这里保留为兜底，避免组件被别处复用时露出本地 CSV 写入口。
   */
  readonly?: boolean
}>()

const dataMappingStore = useDataMappingStore()

const csvFile = ref<File | null>(null)
const csvTableName = ref('')
const csvSortieId = ref<number | undefined>(undefined)
/** 用户是否手工改过表名：改过就不再被「架次号」默认值覆盖 */
const tableNameEdited = ref(false)
const uploadRef = ref()

// ---- 架次列表（只服务上传时的「关联架次」下拉） ----
const sorties = ref<Sortie[]>([])
/** 只有带本地主键的架次才能绑定 CSV 表；三方架次的数据来自三方平台，不参与本地绑定 */
const localSorties = computed(() => sorties.value.filter((s) => hasLocalSortieId(s)))
const sortiesLoading = ref(false)
/** 所选架次已建好的表名（只为默认表名避让重名，故只查选中的那一个架次） */
const sortieTables = ref<string[]>([])
let tablesToken = 0

async function loadSorties() {
  if (!props.aircraftNumber) return
  sortiesLoading.value = true
  try {
    sorties.value = await getSorties(props.aircraftNumber)
  } catch (e) {
    ElMessage.error('获取架次列表失败: ' + (e as Error).message)
    sorties.value = []
  } finally {
    sortiesLoading.value = false
  }
}

/**
 * 取某架次下已建好的表名（含 `csv_` 前缀形态，交由 defaultCsvTableName 归一）。
 * 三方架次没有本地主键，也就没有 config_data_mapping，连查都不该查
 * （否则会发出 ?sortieId=null 这种请求）。
 * 连点两个架次时后发的响应可能先到，故用 token 丢弃过期结果。
 */
async function loadSortieTables(sortieId: number | undefined) {
  const token = ++tablesToken
  if (sortieId === undefined) {
    sortieTables.value = []
    return
  }
  try {
    const maps = await getMappings({ sortieId })
    if (token !== tablesToken) return
    sortieTables.value = maps.map((m) => m.csvTableName)
  } catch {
    if (token !== tablesToken) return
    sortieTables.value = []
  }
}

/** 默认表名 = 架次号（同架次重复上传自动加序号） */
function defaultTableName(sortieId: number | undefined): string {
  if (sortieId === undefined) return ''
  const sortie = sorties.value.find((s) => s.sortieId === sortieId)
  return defaultCsvTableName(sortie, sortieTables.value)
}

// 选中架次即带出表名；清空架次（如切机）则一并清空
watch(csvSortieId, async (id) => {
  tableNameEdited.value = false
  // 先清空，避免上一个架次的表名在新架次的映射回来之前留在输入框里
  csvTableName.value = ''
  sortieTables.value = []
  await loadSortieTables(id)
  csvTableName.value = defaultTableName(id)
})

/** 手工改过表名后想回到架次号 */
function resetTableName() {
  tableNameEdited.value = false
  csvTableName.value = defaultTableName(csvSortieId.value)
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
}

/**
 * 重置上传控件。el-upload 的 `clearFiles()` 只清内部列表、不动原生 input.value，
 * 导致用户再选**同一个文件**时不会触发 change（csvFile 一直为空，上传按钮点不动）。
 */
function resetUploadInput() {
  uploadRef.value?.clearFiles()
  const input = uploadRef.value?.$el?.querySelector?.('input[type="file"]')
  if (input) input.value = ''
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

/**
 * 预览表格的行：CSV 原始表头 + 后端落库用的物理列名 + SQL 类型。
 *
 * 后端把表头里的非 ASCII 字符逐个换成 `_`（`时间` → `__`、`传感器1` → `___1`），
 * columnTypes 的键就是这些物理列名 —— 只显示它，用户根本认不出自己的列。
 * 原始表头后端也一并在 originalColumns 里返回，且与 columns 同序，对齐即可。
 */
const previewColumns = computed(() => {
  const analysis = dataMappingStore.previewResult?.analysis
  if (!analysis) return []
  const cols = analysis.columns ?? []
  const original = analysis.originalColumns ?? []
  return Object.entries(analysis.columnTypes ?? {}).map(([sql, type], i) => {
    // columnTypes 的键大小写可能与 columns 不一致，按折叠大小写找下标
    const idx = cols.findIndex((c) => c.toLowerCase() === sql.toLowerCase())
    return { sql, type, original: original[idx >= 0 ? idx : i] ?? sql }
  })
})

async function handleCsvUpload() {
  if (csvSortieId.value === undefined) {
    ElMessage.warning('请先选择关联架次')
    return
  }
  // 硬校验：POST /csv/upload 只认本地架次主键。三方架次没有本地 config_data_mapping，
  // 其数据来自三方平台，无论如何都不该走本地 CSV 上传（宁可拦下也不发无效请求）。
  const target = sorties.value.find((s) => s.sortieId === csvSortieId.value)
  if (!target || !hasLocalSortieId(target)) {
    ElMessage.warning('三方架次不支持上传本地 CSV 表')
    return
  }
  if (!csvFile.value || !csvTableName.value.trim()) {
    ElMessage.warning('请选择 CSV 文件并填写表名')
    return
  }
  // readonly（三方单机兜底）下同样不允许发上传请求
  if (props.readonly) {
    ElMessage.warning('该飞行器为只读，不支持上传本地 CSV 表')
    return
  }
  try {
    await dataMappingStore.uploadCsv(csvFile.value, csvTableName.value.trim(), csvSortieId.value)
    ElMessage.success(dataMappingStore.uploadResult?.message || '上传成功')
    // 重置：保留架次选择，便于同架次连传多张表
    csvFile.value = null
    dataMappingStore.clearAnalysis()
    resetUploadInput()
    // 该架次多了一张表，按最新映射重算默认表名（下次上传自动避让）
    tableNameEdited.value = false
    await loadSortieTables(csvSortieId.value)
    csvTableName.value = defaultTableName(csvSortieId.value)
  } catch (e) {
    // 失败原因必须回显：后端会用业务话术说明为什么（如「该架次已绑定CSV表，不能重复绑定」），
    // store 只记录结果、不负责提示，这里吞掉的话用户点完「上传」什么也看不到
    ElMessage.error((e as Error).message || '上传失败')
  }
}

</script>

<template>
  <div class="page-inner">
    <div class="page-inner-header">
      <h2 class="inner-title">数据管理</h2>
    </div>

    <!-- CSV 上传区域（外部平台只读时隐藏） -->
    <div v-if="!readonly" class="upload-section">
      <div class="section-title">CSV 数据上传</div>
      <div class="upload-form">
        <div class="upload-grid">
          <!-- 左：文件 -->
          <el-form-item label="CSV 文件" class="upload-file-item">
            <el-upload
              ref="uploadRef"
              :auto-upload="false"
              :limit="1"
              accept=".csv"
              class="upload-trigger"
              :on-change="(f: any) => handleFileChange(f.raw)"
              drag
            >
              <el-icon class="el-icon--upload"><Upload /></el-icon>
              <div class="el-upload__text">拖拽或点击上传 CSV 文件</div>
            </el-upload>
          </el-form-item>

          <!-- 右：关联信息（表名由架次号带出，可改） -->
          <div class="upload-fields">
            <el-form-item label="关联架次" required>
              <el-select
                v-model="csvSortieId"
                placeholder="选择架次（必选）"
                clearable
                filterable
                :loading="sortiesLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="s in localSorties"
                  :key="s.sortieId"
                  :label="`${s.sortieNumber || s.sortieId}（${s.flightDate || '未填日期'}）`"
                  :value="s.sortieId"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="数据表名" required>
              <el-input
                v-model="csvTableName"
                placeholder="选择架次后自动填充"
                @input="tableNameEdited = true"
              />
              <!-- 改过表名才出现「恢复为架次号」：默认形态不用解释，表名本身就是架次号 -->
              <el-link
                v-if="tableNameEdited"
                type="primary"
                underline="never"
                class="field-link"
                @click="resetTableName"
              >
                恢复为架次号
              </el-link>
            </el-form-item>
          </div>
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
          <span v-if="!sorties.length" class="actions-hint">
            该单机还没有架次，请先在「架次查询」页添加
          </span>
          <span v-else-if="!localSorties.length" class="actions-hint">
            该单机的架次都来自三方平台，没有本地主键，无法绑定 CSV 表
          </span>
          <span v-else-if="csvSortieId === undefined" class="actions-hint">
            先选关联架次，表名会自动带出
          </span>
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
          :data="previewColumns"
          size="small"
          max-height="200"
        >
          <el-table-column prop="original" label="原始列名" min-width="140" />
          <el-table-column prop="sql" label="物理列名" min-width="140" />
          <el-table-column prop="type" label="SQL 类型" width="120" />
        </el-table>
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
  font-size: 20px;
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

/* 左文件 / 右关联信息：把原先竖排 4 行压成一屏可见 */
.upload-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 24px;
  align-items: stretch;
}

.upload-file-item {
  margin-bottom: 0;
}

/* el-upload 的根节点是无 class 的 div，挂 class 后才能让它撑满左栏 */
.upload-file-item :deep(.el-form-item__content) {
  flex: 1;
  align-items: stretch;
}

.upload-file-item :deep(.upload-trigger) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.upload-file-item :deep(.el-upload) {
  flex: 1;
  display: flex;
}

.upload-file-item :deep(.el-upload-dragger) {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.upload-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-fields :deep(.el-form-item) {
  margin-bottom: 12px;
}

.field-link {
  font-size: 12px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.actions-hint {
  font-size: 12px;
  color: #909399;
}

@media (max-width: 900px) {
  .upload-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .upload-file-item :deep(.el-upload-dragger) {
    min-height: 150px;
  }
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

</style>
