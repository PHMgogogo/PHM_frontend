<template>
  <div class="diagnosis-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">增强诊断</h2>
        <p class="page-subtitle">选择架次与已保存模型，查看对应算法实例的诊断结果</p>
      </div>
      <el-button :icon="Refresh" :loading="sortiesLoading" @click="loadSorties">
        刷新架次
      </el-button>
    </div>

    <div class="workbench">
      <section class="column sortie-column">
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

        <div v-loading="sortiesLoading" class="column-body">
          <button
            v-for="sortie in filteredSorties"
            :key="sortie.sortieKey"
            type="button"
            class="sortie-item"
            :class="{ active: selectedSortie?.sortieKey === sortie.sortieKey }"
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
      </section>

      <section class="column model-column">
        <div class="column-header">
          <div>
            <span class="column-index">02</span>
            <span class="column-title">算法模型</span>
          </div>
          <span class="column-count">{{ models.length }}</span>
        </div>

        <div class="context-line">
          <span class="context-label">当前架次</span>
          <span class="context-value">
            {{ selectedSortie?.sortieNumber || selectedSortie?.sortieKey || '未选择' }}
          </span>
        </div>

        <div v-loading="modelsLoading" class="column-body">
          <template v-if="selectedSortie">
            <button
              v-for="model in models"
              :key="model.model_id"
              type="button"
              class="model-item"
              :class="{ active: selectedModel?.model_id === model.model_id }"
              @click="selectedModel = model"
            >
              <span class="model-head">
                <span class="item-main">{{ model.name || '未命名模型' }}</span>
                <el-icon class="model-arrow"><ArrowRight /></el-icon>
              </span>
              <span class="algorithm-line">
                {{ model.algorithm_name || model.algorithm_id || '未知算法' }}
              </span>
              <span v-if="model.description" class="model-note">{{ model.description }}</span>
              <span class="model-foot">
                <span>{{ formatSavedAt(model.time) }}</span>
                <span>v{{ model.version }}</span>
              </span>
            </button>

            <el-empty
              v-if="!modelsLoading && models.length === 0"
              description="该架次暂无已保存模型"
              :image-size="58"
            >
              <el-button
                type="primary"
                plain
                size="small"
                @click="emit('open-timeseries', selectedSortie)"
              >
                前往时序数据查询训练
              </el-button>
            </el-empty>
          </template>

          <el-empty v-else description="请先从左侧选择架次" :image-size="58" />
        </div>
      </section>

      <section class="column result-column">
        <div class="column-header">
          <div>
            <span class="column-index">03</span>
            <span class="column-title">推理结果</span>
          </div>
          <el-tag v-if="selectedModel" type="success" effect="plain" size="small">
            模型已选择
          </el-tag>
        </div>

        <div class="column-body result-body">
          <template v-if="selectedModel">
            <div class="model-summary">
              <div class="summary-heading">
                <div>
                  <div class="summary-name">{{ selectedModel.name }}</div>
                  <div class="summary-algorithm">
                    {{ selectedModel.algorithm_name || selectedModel.algorithm_id || '未知算法' }}
                  </div>
                </div>
                <el-button link type="primary" @click="emit('open-model-management')">
                  模型管理
                </el-button>
              </div>

              <div class="summary-grid">
                <div class="summary-cell">
                  <span class="summary-label">所属架次</span>
                  <span class="summary-value">
                    {{ selectedModel.sortie_number || selectedModel.sortie_key }}
                  </span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">训练数据</span>
                  <span class="summary-value">{{ modelSource(selectedModel) }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">数据列</span>
                  <span class="summary-value">
                    {{ selectedModel.data_columns.length }} 输入 /
                    {{ selectedModel.label_columns.length }} 标签
                  </span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">保存时间</span>
                  <span class="summary-value">{{ formatSavedAt(selectedModel.time) }}</span>
                </div>
              </div>
            </div>

            <div class="result-panel">
              <InstanceInferencePanel
                :instance-id="selectedModel.instance_id"
                title="模型实例诊断结果"
                initial-view-mode="chart"
              />
            </div>
          </template>

          <el-empty
            v-else
            description="从中栏选择模型后查看推理结果"
            :image-size="80"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getSorties } from '@/api/aircraft'
import { trainedModelApi } from '@/api/trainedModel'
import { baseModelCode, hasLocalSortieId } from '@/utils/aircraft-source'
import InstanceInferencePanel from '@/components/inference/InstanceInferencePanel.vue'
import type { Sortie, TrainedModel } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const emit = defineEmits<{
  (e: 'open-timeseries', sortie: Sortie): void
  (e: 'open-model-management'): void
}>()

const sorties = ref<Sortie[]>([])
const models = ref<TrainedModel[]>([])
const selectedSortie = ref<Sortie | null>(null)
const selectedModel = ref<TrainedModel | null>(null)
const sortieKeyword = ref('')
const sortiesLoading = ref(false)
const modelsLoading = ref(false)

let sortiesRequest = 0
let modelsRequest = 0

const filteredSorties = computed(() => {
  const keyword = sortieKeyword.value.trim().toLowerCase()
  if (!keyword) return sorties.value
  return sorties.value.filter((sortie) =>
    [sortie.sortieNumber, sortie.sortieKey, sortie.flightDate].some((value) =>
      value?.toLowerCase().includes(keyword),
    ),
  )
})

async function loadSorties() {
  const request = ++sortiesRequest
  const previousKey = selectedSortie.value?.sortieKey
  sortiesLoading.value = true
  try {
    const rows = await getSorties(baseModelCode(props.modelCode), props.aircraftNumber)
    if (request !== sortiesRequest) return
    sorties.value = rows.filter((item) => item.aircraftNumber === props.aircraftNumber)
    selectedSortie.value =
      sorties.value.find((item) => item.sortieKey === previousKey) ?? sorties.value[0] ?? null
  } catch (error) {
    if (request !== sortiesRequest) return
    sorties.value = []
    selectedSortie.value = null
    ElMessage.error('加载架次失败: ' + (error as Error).message)
  } finally {
    if (request === sortiesRequest) sortiesLoading.value = false
  }
}

async function loadModels() {
  const sortie = selectedSortie.value
  const request = ++modelsRequest
  selectedModel.value = null

  if (!sortie) {
    models.value = []
    return
  }

  modelsLoading.value = true
  try {
    const rows = await trainedModelApi.list({
      aircraft_number: props.aircraftNumber,
      model_code: props.modelCode,
      sortie_key: sortie.sortieKey,
    })
    if (request !== modelsRequest) return
    models.value = rows
    selectedModel.value = rows[0] ?? null
  } catch (error) {
    if (request !== modelsRequest) return
    models.value = []
    ElMessage.error('加载该架次模型失败: ' + (error as Error).message)
  } finally {
    if (request === modelsRequest) modelsLoading.value = false
  }
}

function selectSortie(sortie: Sortie) {
  if (selectedSortie.value?.sortieKey === sortie.sortieKey) return
  selectedSortie.value = sortie
}

function timeText(value?: string | null) {
  if (!value || value === '-') return '--'
  return value
}

function formatSavedAt(value: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function modelSource(model: TrainedModel) {
  if (model.data_table_name) return model.data_table_name
  return model.source_type === 'external' ? '第三方时序数据' : '架次时序数据'
}

watch(selectedSortie, loadModels)
watch(
  () => [props.aircraftNumber, props.modelCode],
  loadSorties,
)

onMounted(loadSorties)
</script>

<style scoped>
.diagnosis-page {
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
  padding: 24px 24px 14px;
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

.workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(180px, 0.75fr) minmax(220px, 1fr) minmax(320px, 1.9fr);
  gap: 12px;
  padding: 0 24px 24px;
}

.column {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
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

.column-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px 12px;
}

.context-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 2px;
  font-size: 12px;
}

.context-label {
  color: #8c9ab0;
}

.context-value {
  min-width: 0;
  overflow: hidden;
  color: #3a4a5c;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sortie-item,
.model-item {
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
.sortie-item.active,
.model-item:hover,
.model-item.active {
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

.model-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-arrow {
  flex-shrink: 0;
  color: #9aa8bb;
}

.algorithm-line {
  overflow: hidden;
  color: #2f6fdd;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-note {
  display: -webkit-box;
  overflow: hidden;
  color: #7a8799;
  font-size: 11px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.model-foot {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #98a4b4;
  font-size: 10px;
}

.model-foot span:last-child {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-body {
  padding: 14px;
}

.model-summary {
  padding: 12px 14px;
  border: 1px solid #e1e8f3;
  border-radius: 8px;
  background: #f8fafd;
}

.summary-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.summary-name {
  color: #0d1f3c;
  font-size: 15px;
  font-weight: 700;
}

.summary-algorithm {
  margin-top: 3px;
  color: #2f6fdd;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  margin-top: 12px;
}

.summary-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  color: #8c9ab0;
  font-size: 11px;
}

.summary-value {
  overflow: hidden;
  color: #46566d;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-panel {
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .page-header {
    padding-right: 16px;
    padding-left: 16px;
  }

  .workbench {
    grid-template-columns: minmax(170px, 0.7fr) minmax(200px, 0.95fr) minmax(290px, 1.8fr);
    gap: 10px;
    padding: 0 16px 16px;
  }

  .column-header {
    padding: 0 10px;
  }

  .column-body {
    padding-right: 8px;
    padding-left: 8px;
  }
}

@media (max-width: 820px) {
  .diagnosis-page {
    overflow-y: auto;
  }

  .workbench {
    flex: none;
    grid-template-columns: 1fr;
  }

  .column {
    min-height: 320px;
  }

  .result-column {
    min-height: 560px;
  }
}
</style>
