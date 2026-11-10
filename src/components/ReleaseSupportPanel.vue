<template>
  <div class="release-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">放飞支持</h2>
        <p class="page-subtitle">逐列稳健统计 v1.0，基于当前架次 CSV 数值属性自动评估</p>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" :loading="loading" @click="evaluate">重新评估</el-button>
      </div>
    </div>

    <div class="release-layout">
      <aside class="sortie-column">
        <div class="column-header">
          <div>
            <span class="column-index">01</span>
            <span class="column-title">架次数据</span>
          </div>
          <span class="column-count">{{ filteredSorties.length }}</span>
        </div>

        <el-input
          v-model="sortieKeyword"
          class="column-search"
          clearable
          placeholder="搜索架次号或日期"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div v-loading="sortiesLoading" class="sortie-list">
          <button
            v-for="sortie in filteredSorties"
            :key="sortie.sortieKey"
            type="button"
            class="sortie-item"
            :class="{ active: selectedSortieKey === sortie.sortieKey }"
            @click="selectSortie(sortie)"
          >
            <span class="item-main">{{ sortie.sortieNumber || sortie.sortieKey }}</span>
            <span class="item-meta">{{ sortie.flightDate || '日期未知' }}</span>
            <span class="item-meta">
              {{ timeText(sortie.startTime) }} ~ {{ timeText(sortie.endTime) }}
            </span>
            <span class="source-tag" :class="{ external: !hasLocalSortieId(sortie) }">
              {{ hasLocalSortieId(sortie) ? '本地' : '第三方' }}
            </span>
          </button>

          <el-empty
            v-if="!sortiesLoading && !filteredSorties.length"
            :description="sorties.length ? '没有匹配的架次' : '该单机暂无架次'"
            :image-size="58"
          />
        </div>
      </aside>

      <section class="support-column">
        <el-alert
          v-if="error"
          class="page-error"
          type="error"
          :closable="false"
          show-icon
          :title="error"
        />

        <div v-loading="loading" class="support-body">
          <el-empty
            v-if="!loading && !result"
            description="请选择包含本地 CSV 数据表的架次"
            :image-size="90"
          />

          <template v-else-if="result">
        <section class="decision-band" :class="`decision-${result.decision}`">
          <div class="decision-copy">
            <span class="decision-kicker">放飞建议</span>
            <div class="decision-title-row">
              <strong class="decision-title">{{ result.label }}</strong>
              <el-tag :type="decisionTagType" effect="dark">{{ decisionCode }}</el-tag>
            </div>
            <p class="decision-reason">{{ result.reasons.join('；') }}</p>
            <div class="decision-meta">
              <span>{{ selectedSortie?.sortieNumber || selectedSortie?.sortieKey || '--' }}</span>
              <span>{{ selectedSortie?.flightDate || '日期未知' }}</span>
              <span>{{ scoringTime }}</span>
            </div>
          </div>

          <div class="score-board">
            <el-progress
              type="dashboard"
              :percentage="Math.round(result.score ?? 0)"
              :width="118"
              :stroke-width="10"
              :color="scoreColor"
            >
              <template #default>
                <span class="score-value">{{ formatScore(result.score) }}</span>
                <span class="score-label">综合健康分</span>
              </template>
            </el-progress>
          </div>
        </section>

        <section class="metric-grid">
          <div class="metric-cell">
            <span class="metric-label">低分属性均值</span>
            <strong>{{ formatScore(result.lowScore) }}</strong>
            <span class="metric-hint">最低 10% 属性</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">判定置信度</span>
            <strong>{{ formatPercent(result.confidence) }}</strong>
            <span class="metric-hint">数据覆盖与基线质量</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">数值属性</span>
            <strong>{{ result.scoredAttributes }} / {{ result.totalAttributes }}</strong>
            <span class="metric-hint">参与评分 / 识别总数</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">统计样本</span>
            <strong>{{ result.evaluationRows }} 行</strong>
            <span class="metric-hint">基线 {{ result.baselineRows }} 行</span>
          </div>
        </section>

        <el-alert
          class="baseline-note"
          type="info"
          :closable="false"
          show-icon
          :title="`当前架次前 ${result.baselineRows} 行作为基线，最后 ${result.evaluationRows} 行作为评估窗口；结论用于历史统计复核，不代表实时放飞许可。`"
        />

        <section class="evidence-section">
          <div class="section-heading">
            <div>
              <h3>逐列统计证据</h3>
              <p>
                共识别 {{ result.totalAttributes }} 个数值属性，按健康分从低到高展示
                {{ displayAttributes.length }} 个。
              </p>
            </div>
            <el-tag type="info" effect="plain">规则版本 v1.0</el-tag>
          </div>

          <el-table
            :data="displayAttributes"
            height="420"
            border
            size="small"
            class="evidence-table"
            empty-text="没有可展示的数值属性"
          >
            <el-table-column prop="name" label="属性" min-width="190" show-overflow-tooltip />
            <el-table-column label="健康分" width="150">
              <template #default="{ row }">
                <el-progress
                  v-if="row.healthScore !== null"
                  :percentage="Math.round(row.healthScore)"
                  :stroke-width="8"
                  :color="attributeScoreColor(row.healthScore)"
                />
                <span v-else class="muted">--</span>
              </template>
            </el-table-column>
            <el-table-column label="稳健偏离" width="110" align="right">
              <template #default="{ row }">
                {{ row.deviation === null ? '--' : `${row.deviation.toFixed(2)}σ` }}
              </template>
            </el-table-column>
            <el-table-column label="越界率" width="100" align="right">
              <template #default="{ row }">
                {{ row.exceedanceRate === null ? '--' : formatPercent(row.exceedanceRate) }}
              </template>
            </el-table-column>
            <el-table-column label="趋势" width="90" align="right">
              <template #default="{ row }">
                {{ row.trend === null ? '--' : row.trend.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="覆盖率" width="100" align="right">
              <template #default="{ row }">{{ formatPercent(row.coverage) }}</template>
            </el-table-column>
            <el-table-column label="判定" width="110" align="center">
              <template #default="{ row }">
                <el-tooltip :content="row.reason" placement="top">
                  <el-tag :type="attributeTagType(row.status)" effect="plain" size="small">
                    {{ attributeStatusLabel(row.status) }}
                  </el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section class="rule-section">
          <div class="section-heading">
            <div>
              <h3>判定依据</h3>
              <p>任一异常属性不会因其他正常属性较多而被平均掩盖。</p>
            </div>
          </div>
          <div class="rule-grid">
            <div class="rule-item">
              <span>基线</span>
              <strong>中位数 + MAD</strong>
              <p>按列自适应，不依赖固定属性名、单位和阈值。</p>
            </div>
            <div class="rule-item">
              <span>偏离</span>
              <strong>P90 稳健 Z 分数</strong>
              <p>衡量评估窗口相对基线的主要偏离程度。</p>
            </div>
            <div class="rule-item">
              <span>越界</span>
              <strong>基线 0.5% ~ 99.5%</strong>
              <p>统计评估窗口落在历史基线尾部之外的比例。</p>
            </div>
            <div class="rule-item">
              <span>汇总</span>
              <strong>加权分 70% + 低分 30%</strong>
              <p>同时考虑整体状态和表现最差的一批属性。</p>
            </div>
          </div>
        </section>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getMappings, getSorties } from '@/api/aircraft'
import { getCsvOverview, queryTimeseries } from '@/api/csv'
import { baseModelCode, hasLocalSortieId } from '@/utils/aircraft-source'
import {
  analyzeReleaseSupport,
  numericColumnsFromOverview,
  type AttributeStatus,
  type ReleaseDecision,
  type ReleaseSupportResult,
} from '@/utils/releaseSupport'
import {
  buildTimeseriesQuery,
  pickDeviceMapping,
  tableToDeviceName,
} from '@/utils/timeseries'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const sorties = ref<Sortie[]>([])
const selectedSortieKey = ref('')
const sortieKeyword = ref('')
const sortiesLoading = ref(false)
const loading = ref(false)
const result = ref<ReleaseSupportResult | null>(null)
const error = ref('')
const scoringTime = ref('')
let sortieRequest = 0
let scoringRequest = 0

const selectedSortie = computed(
  () => sorties.value.find((sortie) => sortie.sortieKey === selectedSortieKey.value) ?? null,
)

const filteredSorties = computed(() => {
  const keyword = sortieKeyword.value.trim().toLowerCase()
  if (!keyword) return sorties.value
  return sorties.value.filter((sortie) =>
    [sortie.sortieNumber, sortie.sortieKey, sortie.flightDate].some((value) =>
      value?.toLowerCase().includes(keyword),
    ),
  )
})

const displayAttributes = computed(() => result.value?.attributes.slice(0, 50) ?? [])

const decisionTagType = computed(() => {
  const map: Record<ReleaseDecision, 'success' | 'warning' | 'danger' | 'info'> = {
    release: 'success',
    conditional: 'warning',
    'no-release': 'danger',
    insufficient: 'info',
  }
  return map[result.value?.decision ?? 'insufficient']
})

const decisionCode = computed(() => {
  const map: Record<ReleaseDecision, string> = {
    release: 'GO',
    conditional: 'REVIEW',
    'no-release': 'NO-GO',
    insufficient: 'NO DATA',
  }
  return map[result.value?.decision ?? 'insufficient']
})

const scoreColor = computed(() => {
  const score = result.value?.score ?? 0
  if (score >= 85) return '#23806f'
  if (score >= 75) return '#d97706'
  return '#c2413a'
})

async function loadSorties() {
  const request = ++sortieRequest
  sortiesLoading.value = true
  error.value = ''
  try {
    const rows = await getSorties(baseModelCode(props.modelCode), props.aircraftNumber)
    if (request !== sortieRequest) return
    sorties.value = rows.filter((sortie) => sortie.aircraftNumber === props.aircraftNumber)
    const current = sorties.value.some((sortie) => sortie.sortieKey === selectedSortieKey.value)
    selectedSortieKey.value = current
      ? selectedSortieKey.value
      : sorties.value[0]?.sortieKey ?? ''
    if (selectedSortieKey.value) await evaluate()
    else result.value = null
  } catch (e) {
    if (request !== sortieRequest) return
    sorties.value = []
    selectedSortieKey.value = ''
    result.value = null
    error.value = `加载架次失败：${(e as Error).message}`
  } finally {
    if (request === sortieRequest) sortiesLoading.value = false
  }
}

function selectSortie(sortie: Sortie) {
  if (selectedSortieKey.value === sortie.sortieKey) return
  selectedSortieKey.value = sortie.sortieKey
  void evaluate()
}

async function evaluate() {
  const sortie = selectedSortie.value
  const request = ++scoringRequest
  result.value = null
  error.value = ''
  if (!sortie) return
  if (!hasLocalSortieId(sortie) || sortie.sortieId == null) {
    error.value = '第一版放飞支持仅支持关联本地 CSV 数据表的架次'
    return
  }

  loading.value = true
  try {
    const mappings = await getMappings({ sortieId: sortie.sortieId })
    const mapping = pickDeviceMapping(mappings, sortie)
    if (!mapping?.csvTableName) {
      error.value = '该架次没有关联的本地 CSV 数据表，无法执行逐列统计'
      return
    }

    const overview = await getCsvOverview({
      modelCode: props.modelCode,
      aircraftNumber: sortie.aircraftNumber,
      deviceName: tableToDeviceName(mapping.csvTableName),
    })
    const numericColumns = numericColumnsFromOverview(overview)
    if (!numericColumns.length) {
      error.value = 'CSV 数据表中未识别到可计算的数值属性'
      return
    }

    const data = await queryTimeseries(
      buildTimeseriesQuery({
        sortie,
        modelCode: props.modelCode,
        paralist: numericColumns,
      }),
    )
    if (request !== scoringRequest) return

    result.value = analyzeReleaseSupport(data)
    scoringTime.value = `评估时间 ${new Date().toLocaleString()}`
  } catch (e) {
    if (request !== scoringRequest) return
    error.value = `放飞统计失败：${(e as Error).message}`
    ElMessage.error(error.value)
  } finally {
    if (request === scoringRequest) loading.value = false
  }
}

function formatScore(value: number | null) {
  return value === null ? '--' : value.toFixed(1)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function timeText(value?: string | null) {
  if (!value || value === '-') return '--'
  return value
}

function attributeScoreColor(score: number) {
  if (score >= 85) return '#23806f'
  if (score >= 70) return '#d97706'
  return '#c2413a'
}

function attributeTagType(
  status: AttributeStatus,
): 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<AttributeStatus, 'success' | 'warning' | 'danger' | 'info'> = {
    normal: 'success',
    warning: 'warning',
    critical: 'danger',
    insufficient: 'info',
  }
  return types[status]
}

function attributeStatusLabel(status: AttributeStatus) {
  return {
    normal: '正常',
    warning: '关注',
    critical: '异常',
    insufficient: '数据不足',
  }[status]
}

watch(
  () => [props.aircraftNumber, props.modelCode],
  loadSorties,
)

onMounted(loadSorties)
</script>

<style scoped>
.release-page {
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
  gap: 16px;
  padding: 20px 24px 14px;
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  color: #0d1f3c;
  font-size: 20px;
  font-weight: 700;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #7f8c9f;
  font-size: 13px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-error {
  margin-bottom: 12px;
}

.release-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(210px, 250px) minmax(0, 1fr);
  gap: 12px;
  padding: 0 24px 24px;
}

.sortie-column,
.support-column {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fff;
}

.column-header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid #edf1f7;
}

.column-header > div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.column-index {
  color: #8fa6c5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.column-title {
  color: #0d1f3c;
  font-size: 14px;
  font-weight: 600;
}

.column-count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 10px;
  background: #eef4ff;
  color: #2f6fdd;
  font-size: 12px;
  text-align: center;
}

.column-search {
  margin: 12px 12px 4px;
  width: auto;
}

.sortie-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px 12px;
}

.sortie-item {
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 10px 11px;
  margin-bottom: 8px;
  border: 1px solid #e3e9f2;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.sortie-item:hover,
.sortie-item.active {
  border-color: #3b7cff;
  background: #f5f8ff;
}

.item-main {
  min-width: 0;
  overflow: hidden;
  color: #0d1f3c;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  color: #7f8c9f;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.source-tag {
  position: absolute;
  right: 9px;
  bottom: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  background: #edf8f3;
  color: #288664;
  font-size: 10px;
}

.source-tag.external {
  background: #fff6e8;
  color: #b76a00;
}

.support-column {
  padding: 12px;
}

.support-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.decision-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 168px;
  padding: 22px 26px;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fff;
}

.decision-band.decision-release {
  border-color: #b9ddd4;
  background: #f3faf7;
}

.decision-band.decision-conditional {
  border-color: #f0d1a4;
  background: #fffaf0;
}

.decision-band.decision-no-release {
  border-color: #efc7c3;
  background: #fff6f5;
}

.decision-band.decision-insufficient {
  border-color: #dfe5ec;
  background: #f8fafb;
}

.decision-copy {
  min-width: 0;
}

.decision-kicker {
  color: #7f8c9f;
  font-size: 12px;
}

.decision-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.decision-title {
  color: #0d1f3c;
  font-size: 28px;
  line-height: 1.25;
}

.decision-reason {
  max-width: 760px;
  margin-top: 10px;
  color: #4e5f75;
  font-size: 13px;
  line-height: 1.6;
}

.decision-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 12px;
  color: #8c9ab0;
  font-size: 12px;
}

.score-board {
  flex-shrink: 0;
}

.score-value {
  display: block;
  color: #0d1f3c;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.score-label {
  display: block;
  margin-top: 2px;
  color: #8c9ab0;
  font-size: 11px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fff;
}

.metric-label {
  color: #7f8c9f;
  font-size: 12px;
}

.metric-cell strong {
  color: #0d1f3c;
  font-size: 22px;
  line-height: 1.2;
}

.metric-hint {
  color: #9aa7b8;
  font-size: 11px;
}

.baseline-note {
  margin-top: 12px;
}

.evidence-section,
.rule-section {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fff;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-heading h3 {
  margin: 0;
  color: #0d1f3c;
  font-size: 15px;
  font-weight: 700;
}

.section-heading p {
  margin: 5px 0 0;
  color: #8c9ab0;
  font-size: 12px;
}

.evidence-table {
  width: 100%;
}

.muted {
  color: #a3adba;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.rule-item {
  padding: 14px;
  border: 1px solid #e5ebf3;
  border-radius: 7px;
  background: #f8fafc;
}

.rule-item span {
  color: #8c9ab0;
  font-size: 11px;
}

.rule-item strong {
  display: block;
  margin-top: 4px;
  color: #25364d;
  font-size: 13px;
}

.rule-item p {
  margin: 8px 0 0;
  color: #6f7f92;
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 1100px) {
  .page-header {
    padding-right: 16px;
    padding-left: 16px;
  }

  .release-layout {
    grid-template-columns: minmax(190px, 220px) minmax(0, 1fr);
    padding-right: 16px;
    padding-left: 16px;
  }

  .metric-grid,
  .rule-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .page-header,
  .decision-band {
    flex-direction: column;
    align-items: stretch;
  }

  .release-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .sortie-column {
    min-height: 280px;
    max-height: 340px;
  }

  .support-column {
    min-height: 560px;
    overflow: visible;
  }

  .support-body {
    overflow: visible;
  }

  .metric-grid,
  .rule-grid {
    grid-template-columns: 1fr;
  }

  .decision-title {
    font-size: 23px;
  }
}
</style>
