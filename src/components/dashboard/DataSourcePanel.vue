<!-- 数据源配置面板：单机 → 映射 → 列 → 图表配置 → 查询 -->
<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getMappings, getSorties } from '@/api/aircraft'
import { getCsvOverview } from '@/api/csv'
import { DISPLAY_TYPE, CHART_STYLE } from '@/api/display'
import { getRequiredColumnCount } from './DisplayOptionBuilder.js'

const props = defineProps({
  /** 可选初始单机号；用户可在输入框修改 */
  aircraftNumber: { type: String, default: '' },
})

const emit = defineEmits(['add-chart'])

// ---- 查询方式 ----
// 'column' = 按数据列查询（既有流程）；'sql' = 按SQL语句查询（占位，功能开发中）
const queryMode = ref('column')
const sqlText = ref('')

// ---- 数据源 ----
const localAircraftNumber = ref(props.aircraftNumber || '')
const sorties = ref([])
const selectedSortieId = ref(null)
const sortiesLoading = ref(false)
const mappings = ref([])
const mappingsLoading = ref(false)
const selectedMappingId = ref(null)

// ---- 列候选 ----
const columns = ref([])
const columnsLoading = ref(false)
const selectedColumns = ref([])

// ---- 图表配置 ----
const selectedType = ref(DISPLAY_TYPE.SINGLE_TIMESERIES_2D)
const limit = ref(0)
const selectedSize = ref('medium')
const selectedStyle = ref(CHART_STYLE.LINE)
// 图表标题：用户可自定义；留空则提交后由后端参数自动命名
const selectedTitle = ref('')

const submitting = ref(false)

const typeOptions = [
  { value: DISPLAY_TYPE.SINGLE_TIMESERIES_2D, label: '单参数时序（2D）' },
  { value: DISPLAY_TYPE.MULTI_TIMESERIES_2D, label: '多参数时序（2D）' },
  { value: DISPLAY_TYPE.MAPPING_2D, label: '二维映射（2D）' },
  { value: DISPLAY_TYPE.POINT_CLOUD_3D, label: '三维点云（3D）' },
]

const sizeOptions = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

const styleOptions = [
  { value: CHART_STYLE.LINE, label: '折线' },
  { value: CHART_STYLE.SCATTER, label: '散点' },
  { value: CHART_STYLE.BAR, label: '柱状' },
  { value: CHART_STYLE.AREA, label: '面积' },
]

/** 各图表类型在切换时的默认渲染样式 */
function defaultStyleFor(type) {
  switch (type) {
    case DISPLAY_TYPE.SINGLE_TIMESERIES_2D:
    case DISPLAY_TYPE.MULTI_TIMESERIES_2D:
      return CHART_STYLE.LINE
    case DISPLAY_TYPE.MAPPING_2D:
      return CHART_STYLE.SCATTER
    default: // POINT_CLOUD_3D —— 样式选择器隐藏，占位回落（builder 会忽略）
      return CHART_STYLE.LINE
  }
}

// 3D 点云无可换样式：隐藏样式选择器
const styleEnabled = computed(() => selectedType.value !== DISPLAY_TYPE.POINT_CLOUD_3D)

// 当前选中的 mapping 对象（用于取 csvTableName）
const selectedMapping = computed(() =>
  mappings.value.find((m) => m.mappingId === selectedMappingId.value) || null,
)

// 列数约束提示
const columnConstraint = computed(() => getRequiredColumnCount(selectedType.value))
const columnHint = computed(() => {
  const c = columnConstraint.value
  if (c.exact > 0) return `该类型需恰好选择 ${c.exact} 列（已选 ${selectedColumns.value.length}）`
  return `该类型至少选择 ${c.min} 列（已选 ${selectedColumns.value.length}）`
})

// 列数是否满足要求
const columnsValid = computed(() => {
  const c = columnConstraint.value
  if (c.exact > 0) return selectedColumns.value.length === c.exact
  return selectedColumns.value.length >= c.min
})

const canSubmit = computed(
  () =>
    !!selectedMapping.value &&
    !!selectedMapping.value.csvTableName &&
    columnsValid.value &&
    !submitting.value,
)

// ---- 同步外部 aircraftNumber 变化 ----
watch(
  () => props.aircraftNumber,
  (v) => {
    if (v && v !== localAircraftNumber.value) localAircraftNumber.value = v
  },
)

// ---- 单机号变化 → 拉取架次列表 ----
async function fetchSorties() {
  const num = localAircraftNumber.value.trim()
  if (!num) {
    sorties.value = []
    selectedSortieId.value = null
    mappings.value = []
    return
  }
  sortiesLoading.value = true
  try {
    sorties.value = await getSorties(num)
    selectedSortieId.value = null
    mappings.value = []
    resetDownstream()
  } catch (e) {
    ElMessage.error('获取架次失败: ' + (e instanceof Error ? e.message : String(e)))
    sorties.value = []
  } finally {
    sortiesLoading.value = false
  }
}

// ---- 架次变化 → 拉取该架次的数据映射（CSV 与架次一对一） ----
async function fetchMappings() {
  if (selectedSortieId.value == null) {
    mappings.value = []
    selectedMappingId.value = null
    return
  }
  mappingsLoading.value = true
  try {
    mappings.value = await getMappings({ sortieId: selectedSortieId.value })
    selectedMappingId.value = null
    resetDownstream()
  } catch (e) {
    ElMessage.error('获取数据映射失败: ' + (e instanceof Error ? e.message : String(e)))
    mappings.value = []
  } finally {
    mappingsLoading.value = false
  }
}

// 防抖：用户输入单机号后回车或失焦再查询架次
let aircraftTimer = null
watch(localAircraftNumber, () => {
  if (aircraftTimer) clearTimeout(aircraftTimer)
  aircraftTimer = setTimeout(fetchSorties, 400)
})

// 架次选择变化 → 拉取该架次的映射
watch(selectedSortieId, () => {
  fetchMappings()
})

// ---- mapping 变化 → 拉取列名 ----
watch(selectedMappingId, async (id) => {
  if (id == null) {
    resetDownstream()
    return
  }
  columnsLoading.value = true
  selectedColumns.value = []
  try {
    const overview = await getCsvOverview(id)
    columns.value = overview?.dataColumns ?? []
  } catch (e) {
    ElMessage.error('获取数据列失败: ' + (e instanceof Error ? e.message : String(e)))
    columns.value = []
  } finally {
    columnsLoading.value = false
  }
})

function resetDownstream() {
  columns.value = []
  selectedColumns.value = []
}

// ---- type 变化 → 校验已选列数（超限裁剪）+ 重置样式为该类型默认 ----
watch(selectedType, (t) => {
  const c = columnConstraint.value
  if (c.exact > 0 && selectedColumns.value.length > c.exact) {
    selectedColumns.value = selectedColumns.value.slice(0, c.exact)
  }
  selectedStyle.value = defaultStyleFor(t)
})

// ---- 提交查询 ----
function handleSubmit() {
  if (!canSubmit.value) {
    ElMessage.warning(columnHint.value)
    return
  }
  emit('add-chart', {
    data: selectedMapping.value.csvTableName,
    columns: [...selectedColumns.value],
    limit: Number(limit.value) || 0,
    type: selectedType.value,
    size: selectedSize.value,
    style: selectedStyle.value,
    title: selectedTitle.value.trim(),
  })
}
</script>

<template>
  <div class="data-source-panel">
    <div class="panel-inner">
      <h3 class="panel-title">数据源配置</h3>

      <!-- 查询方式（始终可见，决定下方展示哪一套流程） -->
      <div class="form-group query-mode-group">
        <label>查询方式</label>
        <el-radio-group v-model="queryMode" class="query-mode-radio">
          <el-radio-button value="column">按数据列</el-radio-button>
          <el-radio-button value="sql">按SQL语句</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 按SQL语句查询（占位，功能开发中，无后端能力） -->
      <el-collapse v-if="queryMode === 'sql'" :model-value="['sql']">
        <el-collapse-item title="SQL 语句" name="sql">
          <div class="form-group">
            <el-input
              v-model="sqlText"
              type="textarea"
              :rows="6"
              resize="none"
              disabled
              placeholder="SELECT ... FROM csv_xxx WHERE ...（功能开发中，暂不可用）"
            />
          </div>
          <p class="hint sql-hint">🚧 按 SQL 语句查询功能开发中，暂不可用。请切换到“按数据列”查询。</p>
          <el-button type="primary" plain disabled style="width: 100%; margin-top: 4px">
            查询并添加图表
          </el-button>
        </el-collapse-item>
      </el-collapse>

      <!-- 按数据列查询（既有流程） -->
      <el-collapse v-else :model-value="['source', 'chart', 'action']">
        <!-- 1. 数据源 -->
        <el-collapse-item title="数据源" name="source">
          <div class="form-group">
            <label>单机编号</label>
            <el-input
              v-model="localAircraftNumber"
              placeholder="输入单机编号，如 J-20A"
              clearable
              size="default"
            />
          </div>
          <div class="form-group">
            <label>架次</label>
            <el-select
              v-model="selectedSortieId"
              placeholder="选择架次"
              :loading="sortiesLoading"
              :disabled="sorties.length === 0"
              style="width: 100%"
              size="default"
            >
              <el-option
                v-for="s in sorties"
                :key="s.sortieId"
                :value="s.sortieId"
                :label="`${s.sortieNumber || s.sortieId}（${s.flightDate || ''}）`"
              />
            </el-select>
            <p v-if="sorties.length === 0 && !sortiesLoading" class="hint">
              暂无架次，请确认单机编号
            </p>
          </div>
          <div class="form-group">
            <label>数据映射</label>
            <el-select
              v-model="selectedMappingId"
              placeholder="选择数据映射"
              :loading="mappingsLoading"
              :disabled="mappings.length === 0"
              style="width: 100%"
              size="default"
            >
              <el-option
                v-for="m in mappings"
                :key="m.mappingId"
                :value="m.mappingId"
                :label="m.csvTableName"
              />
            </el-select>
            <p v-if="mappings.length === 0 && !mappingsLoading" class="hint">
              暂无映射，请先选择架次
            </p>
          </div>
        </el-collapse-item>

        <!-- 2. 图表配置 -->
        <el-collapse-item title="图表配置" name="chart">
          <div class="form-group">
            <label>图表标题</label>
            <el-input
              v-model="selectedTitle"
              placeholder="留空则按参数自动命名"
              clearable
              size="default"
            />
          </div>

          <div class="form-group">
            <label>图表类型</label>
            <el-select v-model="selectedType" style="width: 100%" size="default">
              <el-option
                v-for="t in typeOptions"
                :key="t.value"
                :value="t.value"
                :label="t.label"
              />
            </el-select>
          </div>

          <div class="form-group" v-if="styleEnabled">
            <label>图表样式</label>
            <el-select v-model="selectedStyle" style="width: 100%" size="default">
              <el-option
                v-for="s in styleOptions"
                :key="s.value"
                :value="s.value"
                :label="s.label"
              />
            </el-select>
          </div>

          <div class="form-group">
            <label>数据列</label>
            <el-select
              v-model="selectedColumns"
              multiple
              collapse-tags
              collapse-tags-tooltip
              placeholder="选择数据列"
              :loading="columnsLoading"
              :disabled="columns.length === 0"
              style="width: 100%"
              size="default"
            >
              <el-option
                v-for="c in columns"
                :key="c"
                :value="c"
                :label="c"
              />
            </el-select>
            <p class="hint" :class="{ invalid: !columnsValid }">{{ columnHint }}</p>
          </div>

          <div class="form-group">
            <label>数据点上限（0=不限）</label>
            <el-input-number
              v-model="limit"
              :min="0"
              :step="100"
              controls-position="right"
              style="width: 100%"
              size="default"
            />
          </div>

          <div class="form-group">
            <label>窗口大小</label>
            <el-select v-model="selectedSize" style="width: 100%" size="default">
              <el-option
                v-for="s in sizeOptions"
                :key="s.value"
                :value="s.value"
                :label="s.label"
              />
            </el-select>
          </div>
        </el-collapse-item>

        <!-- 3. 操作 -->
        <el-collapse-item title="操作" name="action">
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            style="width: 100%"
            @click="handleSubmit"
          >
            查询并添加图表
          </el-button>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<style scoped>
.data-source-panel {
  width: 100%;
  height: 100%;
  position: relative;
  background: #ffffff;
  border-left: 1px solid #e4e8f1;
  overflow: hidden;
}

.panel-inner {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px 24px;
  box-sizing: border-box;
}

.panel-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #0d1f3c;
}

.form-group {
  margin-bottom: 14px;
}

.form-group > label {
  display: block;
  font-size: 12px;
  color: #8c9ab0;
  font-weight: 500;
  margin-bottom: 6px;
}

.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #8c9ab0;
  line-height: 1.4;
}

.hint.invalid {
  color: #f56c6c;
}

/* 查询方式：两个按钮均分宽度 */
.query-mode-radio {
  display: flex;
  width: 100%;
}
.query-mode-radio :deep(.el-radio-button) {
  flex: 1;
}
.query-mode-radio :deep(.el-radio-button__inner) {
  width: 100%;
}

/* SQL 占位提示 */
.sql-hint {
  color: #f5a623;
}

/* el-collapse 折叠项标题字号微调 */
:deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 8px;
}
</style>
