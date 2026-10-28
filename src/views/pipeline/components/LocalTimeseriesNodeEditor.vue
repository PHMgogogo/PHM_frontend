<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PropertyPicker from '@/components/PropertyPicker.vue'
import { getMappings, getSorties } from '@/api/aircraft'
import { getCsvOverview } from '@/api/csv'
import { baseModelCode, hasLocalSortieId } from '@/utils/aircraft-source'
import {
  pickDeviceMapping,
  propertyCandidates,
  reconcileSelection,
  tableToDeviceName,
} from '@/utils/timeseries'
import type { Sortie } from '@/types/entities'
import type { NodeData } from '../NodeData'
import { _ } from '../i18n'

const props = defineProps<{
  node: NodeData
  aircraftNumber: string
  modelCode: string
}>()

interface LocalTimeseriesParams {
  sortie_key: string
  sortie_number: string
  aircraft_number: string
  airplane_type: string
  start_time: string
  end_time: string
  data_cols: string[]
  label_cols: string[]
}

const params = computed(() => props.node.in_parameters as LocalTimeseriesParams)
const sorties = ref<Sortie[]>([])
const sortiesLoading = ref(false)
const columnsLoading = ref(false)
const candidates = ref<string[]>([])
const deviceName = ref('')

function ensureCollections() {
  if (!Array.isArray(params.value.data_cols)) params.value.data_cols = []
  if (!Array.isArray(params.value.label_cols)) params.value.label_cols = []
}

async function loadColumns(selected: Sortie, resetSelection: boolean) {
  columnsLoading.value = true
  try {
    const mappings = await getMappings({ sortieId: selected.sortieId })
    const mapping = pickDeviceMapping(mappings, selected)
    if (!mapping?.csvTableName) {
      candidates.value = []
      deviceName.value = ''
      throw new Error('该架次没有关联本地数据表')
    }

    const name = tableToDeviceName(mapping.csvTableName)
    const overview = await getCsvOverview({
      modelCode: baseModelCode(props.modelCode || selected.modelCode || ''),
      aircraftNumber: selected.aircraftNumber,
      deviceName: name,
    })
    const excluded = new Set([
      ...(overview.textColumns ?? []).map((column) => column.toLowerCase()),
      ...(overview.timestampColumn ? [overview.timestampColumn.toLowerCase()] : []),
    ])
    candidates.value = propertyCandidates(overview).filter(
      (column) => !excluded.has(column.toLowerCase()),
    )
    deviceName.value = name

    if (resetSelection) {
      params.value.data_cols = []
      params.value.label_cols = []
    } else {
      params.value.data_cols = params.value.data_cols.length
        ? reconcileSelection(params.value.data_cols, candidates.value)
        : []
      params.value.label_cols = params.value.label_cols.length
        ? reconcileSelection(params.value.label_cols, candidates.value)
        : []
    }
  } catch (error) {
    candidates.value = []
    deviceName.value = ''
    ElMessage.error('加载架次属性失败: ' + (error as Error).message)
  } finally {
    columnsLoading.value = false
  }
}

async function onSortieChange(value: string) {
  const sortie = sorties.value.find((item) => item.sortieKey === value)
  if (!sortie) return
  params.value.sortie_key = sortie.sortieKey
  params.value.sortie_number = sortie.sortieNumber || ''
  params.value.aircraft_number = sortie.aircraftNumber || props.aircraftNumber
  params.value.airplane_type = baseModelCode(sortie.modelCode || props.modelCode)
  params.value.start_time = ''
  params.value.end_time = ''
  await loadColumns(sortie, true)
}

async function loadSorties() {
  ensureCollections()
  sortiesLoading.value = true
  try {
    const code = baseModelCode(props.modelCode)
    if (!code || !props.aircraftNumber) {
      sorties.value = []
      return
    }
    const rows = await getSorties(code, props.aircraftNumber)
    sorties.value = rows.filter(hasLocalSortieId)

    const selected = sorties.value.find((item) => item.sortieKey === params.value.sortie_key)
    if (selected) {
      await loadColumns(selected, false)
    }
  } catch (error) {
    sorties.value = []
    ElMessage.error('加载本地架次失败: ' + (error as Error).message)
  } finally {
    sortiesLoading.value = false
  }
}

onMounted(loadSorties)
watch(
  () => [props.aircraftNumber, props.modelCode],
  () => loadSorties(),
)
</script>

<template>
  <el-form :model="params" label-width="96px" class="local-timeseries-form">
    <el-form-item :label="_('Title')">
      <el-input v-model="node.title" :placeholder="_('No Title')" />
    </el-form-item>

    <el-form-item label="本地架次" required>
      <el-select
        v-model="params.sortie_key"
        filterable
        :loading="sortiesLoading"
        placeholder="请选择当前飞机的本地架次"
        style="width: 100%"
        @change="onSortieChange"
      >
        <el-option
          v-for="sortie in sorties"
          :key="sortie.sortieKey"
          :label="`${sortie.sortieNumber || sortie.sortieKey}（${sortie.flightDate || '未填日期'}）`"
          :value="sortie.sortieKey"
        />
      </el-select>
      <div v-if="!sortiesLoading && sorties.length === 0" class="field-hint">
        当前飞机暂无已绑定本地数据表的架次
      </div>
      <div v-else-if="deviceName" class="field-hint">数据表：{{ deviceName }}</div>
    </el-form-item>

    <el-form-item :label="_('Data Cols')" required>
      <PropertyPicker
        v-model="params.data_cols"
        :options="candidates"
        :loading="columnsLoading"
        label="选择数据列"
      />
    </el-form-item>

    <el-form-item :label="_('Label Cols')" required>
      <PropertyPicker
        v-model="params.label_cols"
        :options="candidates"
        :loading="columnsLoading"
        label="选择标签列"
      />
    </el-form-item>

    <el-form-item label="开始时间">
      <el-date-picker
        v-model="params.start_time"
        type="datetime"
        value-format="YYYY-MM-DD HH:mm:ss"
        placeholder="留空按架次起始时间"
        style="width: 100%"
      />
    </el-form-item>

    <el-form-item label="结束时间">
      <el-date-picker
        v-model="params.end_time"
        type="datetime"
        value-format="YYYY-MM-DD HH:mm:ss"
        placeholder="留空按架次结束时间"
        style="width: 100%"
      />
    </el-form-item>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="取数属性 = 数据列 ∪ 标签列；标签列同时用于计算推理 Loss"
    />
  </el-form>
</template>

<style scoped>
.local-timeseries-form :deep(.el-form-item__label) {
  font-size: 13px;
  white-space: nowrap;
}

.field-hint {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
