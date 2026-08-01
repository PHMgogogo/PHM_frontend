<!-- 数据源配置面板：单机 → 映射 → 列 → 图表配置 → 查询 -->
<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { getMappings, getSorties, getPlanes } from '@/api/aircraft'
import { getCsvOverview } from '@/api/csv'
import { DISPLAY_TYPE, CHART_STYLE } from '@/api/display'
import { getRequiredColumnCount } from './DisplayOptionBuilder.js'

const props = defineProps({
  /** 可选初始单机号；用户可在输入框修改 */
  aircraftNumber: { type: String, default: '' },
  /**
   * 编辑目标：{ id, config } | null。
   * - 非 null：进入编辑态，按 config 回填表单，提交时 emit('update-chart', { id, ...payload })
   * - null：新建态，提交时 emit('add-chart', payload)
   * 仅监听 id 变化触发回填（更新成功后刷新 config 不会重复回填）。
   */
  editTarget: { type: Object, default: null },
})

const emit = defineEmits(['add-chart', 'update-chart', 'cancel-edit'])

// 编辑态 / 新建态
const mode = computed(() => (props.editTarget ? 'edit' : 'create'))

// 回填进行中标志：级联 watcher 见此为 true 时 early-return，避免 resetDownstream/resetAxisSelection 清掉回填值
// 注意：后续新增的「会重置下游/各轴」的 watcher 同样需要此守卫。
const restoring = ref(false)
// 回填并发令牌：快速连续点击不同图表时，只让最后一次 loadConfig 生效
let restoreSeq = 0

// ---- 查询方式 ----
// 'column' = 按数据列查询（既有流程）；'sql' = 按SQL语句查询（占位，功能开发中）
const queryMode = ref('column')
const sqlText = ref('')

// ---- 数据源 ----
const planes = ref([])
const planesLoading = ref(false)
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

// ---- 按轴分选（替代原"数据列"多选） ----
// 各轴按图表类型展开为单选/多选；提交时按 [X, Y, ...] / [X, Y, Z] 组装，
// 与后端位置契约一致：columns[0] 恒为主轴（时序=时间列，映射/点云=X 轴）。
// X 轴：所有类型（单选）；Y 轴：单参数时序/二维映射/三维点云为单选，多参数时序为多选；Z 轴：仅三维点云。
const selectedX = ref('')
const selectedY = ref('')
const selectedYMulti = ref([])
const selectedZ = ref('')

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

// 列数约束（仅用于推导多参数时序 Y 的最少列数）
const columnConstraint = computed(() => getRequiredColumnCount(selectedType.value))

// 按图表类型描述 Y 轴单选/多选与是否有 Z 轴
const axisSpec = computed(() => {
  switch (selectedType.value) {
    case DISPLAY_TYPE.MULTI_TIMESERIES_2D:
      return { y: 'multi', z: false }
    case DISPLAY_TYPE.POINT_CLOUD_3D:
      return { y: 'single', z: true }
    default: // SINGLE_TIMESERIES_2D / MAPPING_2D
      return { y: 'single', z: false }
  }
})

// 跨轴已选项集合：用于在其余轴的下拉里禁用，避免重复选择（自身当前值不禁用）
const takenAll = computed(() => {
  const s = new Set()
  if (selectedX.value) s.add(selectedX.value)
  if (selectedY.value) s.add(selectedY.value)
  if (selectedZ.value) s.add(selectedZ.value)
  for (const c of selectedYMulti.value) s.add(c)
  return s
})

// 各轴是否满足要求
const columnsValid = computed(() => {
  if (!selectedX.value) return false
  const s = axisSpec.value
  if (s.y === 'multi') {
    const yMin = Math.max(columnConstraint.value.min - 1, 1) // 减去 X 列（min=3 → Y≥2）
    if (selectedYMulti.value.length < yMin) return false
  } else if (!selectedY.value) {
    return false
  }
  if (s.z && !selectedZ.value) return false
  return true
})

const columnHint = computed(() => {
  const t = selectedType.value
  if (t === DISPLAY_TYPE.MULTI_TIMESERIES_2D) {
    const yMin = Math.max(columnConstraint.value.min - 1, 1)
    return `X 轴选 1 列（时间），Y 轴至少 ${yMin} 列（已选 ${selectedYMulti.value.length}）`
  }
  if (t === DISPLAY_TYPE.POINT_CLOUD_3D) return '依次选择 X / Y / Z 三列'
  return '依次选择 X / Y 两列' // 单参数时序 / 二维映射
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

// ---- 拉取全部单机候选（getPlanes 不传参 → 库内全部单机）----
async function fetchPlanes() {
  planesLoading.value = true
  try {
    planes.value = await getPlanes()
  } catch (e) {
    ElMessage.error('获取单机列表失败: ' + (e instanceof Error ? e.message : String(e)))
    planes.value = []
  } finally {
    planesLoading.value = false
  }
}

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

// ---- 架次变化 → 拉取该架次的数据映射（一个架次可关联多张表） ----
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

// 选择单机 → 立即拉取该单机的架次列表（下拉离散选择，无需防抖）
watch(localAircraftNumber, () => {
  if (restoring.value) return
  fetchSorties()
})

// 组件挂载：拉取全部单机候选；若外部注入了初始单机号，直接拉取其架次
onMounted(() => {
  fetchPlanes()
  if (localAircraftNumber.value) fetchSorties()
})

// 架次选择变化 → 拉取该架次的映射
watch(selectedSortieId, () => {
  if (restoring.value) return
  fetchMappings()
})

// ---- mapping 变化 → 拉取列名 ----
watch(selectedMappingId, async (id) => {
  if (restoring.value) return
  if (id == null) {
    resetDownstream()
    return
  }
  columnsLoading.value = true
  resetAxisSelection()
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

// 清空所有轴选择
function resetAxisSelection() {
  selectedX.value = ''
  selectedY.value = ''
  selectedYMulti.value = []
  selectedZ.value = ''
}

function resetDownstream() {
  columns.value = []
  resetAxisSelection()
}

/**
 * 退出编辑态、回到「新建」空白态：复用既有 helper 清空表单顶层字段。
 * editTarget.id 变为 null 时由 watcher 触发。
 */
function resetForCreate() {
  localAircraftNumber.value = ''
  selectedSortieId.value = null
  selectedMappingId.value = null
  sorties.value = []
  mappings.value = []
  resetDownstream()
  selectedTitle.value = ''
  selectedType.value = DISPLAY_TYPE.SINGLE_TIMESERIES_2D
  selectedStyle.value = defaultStyleFor(selectedType.value)
  selectedSize.value = 'medium'
  limit.value = 0
}

/**
 * 用图表创建时保存的 config 快照回填整张表单（编辑态）。
 * 关键：restoring 标志压制级联 watcher，避免 resetDownstream/resetAxisSelection 清掉回填值；
 * 直接调 getSorties/getMappings 赋值（不走 fetchSorties/fetchMappings，它们会 reset 下游）；
 * 末尾 await nextTick() 让排队的 watcher 在 restoring 仍为 true 时排空后再降标志。
 */
async function loadConfig(cfg) {
  if (!cfg) return
  const my = ++restoreSeq
  restoring.value = true
  try {
    localAircraftNumber.value = cfg.aircraftNumber || ''
    if (cfg.aircraftNumber) {
      try {
        sorties.value = await getSorties(cfg.aircraftNumber)
      } catch (e) {
        sorties.value = []
      }
      if (my !== restoreSeq) return
    }
    selectedSortieId.value = cfg.sortieId ?? null
    if (cfg.sortieId != null) {
      try {
        mappings.value = await getMappings({ sortieId: cfg.sortieId })
      } catch (e) {
        mappings.value = []
      }
      if (my !== restoreSeq) return
    }
    selectedMappingId.value = cfg.mappingId ?? null
    // 列候选优先用快照（省一次 round-trip，且即使用户中途改了数据源也能正常级联）
    columns.value = Array.isArray(cfg.columnCandidates) ? [...cfg.columnCandidates] : []
    selectedX.value = cfg.x || ''
    selectedY.value = cfg.y || ''
    selectedYMulti.value = Array.isArray(cfg.yMulti) ? [...cfg.yMulti] : []
    selectedZ.value = cfg.z || ''
    selectedType.value = cfg.type || DISPLAY_TYPE.SINGLE_TIMESERIES_2D
    selectedStyle.value = cfg.style || defaultStyleFor(selectedType.value)
    selectedSize.value = cfg.size || 'medium'
    limit.value = cfg.limit ?? 0
    selectedTitle.value = cfg.title || ''
    await nextTick()
  } catch (e) {
    ElMessage.error('恢复图表配置失败: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    restoring.value = false
  }
}

// 监听编辑目标切换：id 变化才回填（更新成功后仅刷新 config，不重复回填）
watch(
  () => props.editTarget?.id,
  (id, oldId) => {
    if (id && id !== oldId) {
      loadConfig(props.editTarget.config)
    } else if (!id && oldId) {
      resetForCreate()
    }
  },
)

// ---- type 变化 → 清空所有轴选择 + 重置样式为该类型默认 ----
watch(selectedType, (t) => {
  if (restoring.value) return
  resetAxisSelection()
  selectedStyle.value = defaultStyleFor(t)
})

// ---- 提交查询（新建 / 编辑两态共用）----
function handleSubmit() {
  if (!canSubmit.value) {
    ElMessage.warning(columnHint.value)
    return
  }
  // 按既定顺序组装请求用列：[X, Y, ...] / [X, Y, Z]，与后端位置契约一致
  // （columns[0] 恒为主轴：时序=时间列，映射/点云=X 轴）
  // 注意：这里命名为 reqColumns，避免与外层 columns ref（列候选列表）重名——
  // 否则下方 columnCandidates: [...columns.value] 会取到本局部数组（无 .value）而报错。
  const t = selectedType.value
  const reqColumns =
    t === DISPLAY_TYPE.MULTI_TIMESERIES_2D
      ? [selectedX.value, ...selectedYMulti.value]
      : t === DISPLAY_TYPE.POINT_CLOUD_3D
        ? [selectedX.value, selectedY.value, selectedZ.value]
        : /* SINGLE_TIMESERIES_2D / MAPPING_2D */ [selectedX.value, selectedY.value]
  const csvTableName = selectedMapping.value.csvTableName
  // 统一 payload：既含后端请求字段，也含回填专用字段（供选中后回填本面板）
  const payload = {
    data: csvTableName,
    columns: reqColumns,
    limit: Number(limit.value) || 0,
    type: selectedType.value,
    size: selectedSize.value,
    style: selectedStyle.value,
    title: selectedTitle.value.trim(),
    // 回填专用：
    aircraftNumber: localAircraftNumber.value,
    sortieId: selectedSortieId.value,
    mappingId: selectedMappingId.value,
    csvTableName,
    columnCandidates: [...columns.value],
    x: selectedX.value,
    y: selectedY.value,
    yMulti: [...selectedYMulti.value],
    z: selectedZ.value,
  }
  // 编辑态 → 原位更新（带 id）；新建态 → 新增。实际异步查询在父级 MonitorView 完成。
  if (mode.value === 'edit') {
    emit('update-chart', { id: props.editTarget.id, ...payload })
  } else {
    emit('add-chart', payload)
  }
}
</script>

<template>
  <div class="data-source-panel">
    <div class="panel-inner">
      <h3 class="panel-title">数据源配置</h3>

      <!-- 编辑态提示条 -->
      <div v-if="mode === 'edit'" class="edit-banner">
        正在编辑选中图表，修改参数后点击「更新图表」即可原位刷新
      </div>

      <!-- 查询方式（始终可见，决定下方展示哪一套流程） -->
      <div class="form-group query-mode-group">
        <label>查询方式</label>
        <el-radio-group v-model="queryMode" class="query-mode-radio">
          <el-radio-button value="column">规则查询</el-radio-button>
          <el-radio-button value="llm">智能查询</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 大模型智能生成接口查询（占位，功能开发中，无后端能力） -->
      <el-collapse v-if="queryMode === 'llm'" :model-value="['llm']">
        <el-collapse-item title="智能查询" name="llm">
          <div class="form-group">
            <el-input
              v-model="sqlText"
              type="textarea"
              :rows="6"
              resize="none"
              disabled
              placeholder="示例：查询单机编号为 A12 的架次 2023-08-15 的飞行参数，并绘制速度随时间变化的折线图"
            />
          </div>
          <p class="hint">占位：大模型智能生成 SQL 查询接口，功能开发中</p>
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
            <el-select
              v-model="localAircraftNumber"
              placeholder="选择单机编号"
              :loading="planesLoading"
              filterable
              clearable
              size="default"
              style="width: 100%"
            >
              <el-option
                v-for="p in planes"
                :key="p.aircraftNumber"
                :value="p.aircraftNumber"
                :label="p.aircraftNumber"
              />
            </el-select>
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

          <!-- X 轴（所有类型都有；时序类型即时间列） -->
          <div class="form-group">
            <label>X 轴数据</label>
            <el-select
              v-model="selectedX"
              placeholder="选择 X 轴数据"
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
                :disabled="selectedX !== c && takenAll.has(c)"
              />
            </el-select>
          </div>

          <!-- Y 轴：多参数时序为多选，其余类型为单选 -->
          <div class="form-group" v-if="axisSpec.y === 'multi'">
            <label>Y 轴数据（多参数）</label>
            <el-select
              v-model="selectedYMulti"
              multiple
              collapse-tags
              collapse-tags-tooltip
              placeholder="选择 Y 轴数据"
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
                :disabled="!selectedYMulti.includes(c) && takenAll.has(c)"
              />
            </el-select>
          </div>
          <div class="form-group" v-else>
            <label>Y 轴数据</label>
            <el-select
              v-model="selectedY"
              placeholder="选择 Y 轴数据"
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
                :disabled="selectedY !== c && takenAll.has(c)"
              />
            </el-select>
          </div>

          <!-- Z 轴（仅三维点云） -->
          <div class="form-group" v-if="axisSpec.z">
            <label>Z 轴数据</label>
            <el-select
              v-model="selectedZ"
              placeholder="选择 Z 轴数据"
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
                :disabled="selectedZ !== c && takenAll.has(c)"
              />
            </el-select>
          </div>

          <p class="hint" :class="{ invalid: !columnsValid }">{{ columnHint }}</p>

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
            {{ mode === 'edit' ? '更新图表' : '查询并添加图表' }}
          </el-button>
          <el-button
            v-if="mode === 'edit'"
            style="width: 100%; margin-top: 8px; margin-left: 0"
            @click="emit('cancel-edit')"
          >
            取消选择 / 新建图表
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

.edit-banner {
  margin: 0 0 16px;
  padding: 8px 12px;
  border: 1px solid #3b7cff;
  background: rgba(59, 124, 255, 0.06);
  border-radius: 6px;
  color: #3b7cff;
  font-size: 12px;
  line-height: 1.5;
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
