<template>
  <div class="life-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">设备寿命</h2>
        <p class="page-subtitle">当前单机构型下全部 EQUIPMENT 的实际寿命使用情况</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="loadLives">刷新寿命</el-button>
    </div>

    <el-alert
      v-if="error"
      class="page-error"
      type="error"
      :closable="false"
      show-icon
      :title="error"
    />

    <div v-loading="loading" class="page-body">
      <el-empty
        v-if="!loading && !error && lives.length === 0"
        description="当前单机构型暂无 EQUIPMENT 寿命数据"
        :image-size="90"
      />

      <template v-else-if="lives.length">
        <section class="summary-grid">
          <div class="summary-cell">
            <span class="summary-label">设备数量</span>
            <strong>{{ lives.length }}</strong>
            <span class="summary-hint">构型中的 EQUIPMENT</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">剩余寿命总计</span>
            <strong>{{ formatHours(totalRemaining) }} 小时</strong>
            <span class="summary-hint">全部设备剩余小时之和</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">已用寿命总计</span>
            <strong>{{ formatHours(totalUsed) }} 小时</strong>
            <span class="summary-hint">全部设备已消耗小时之和</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">最低剩余比例</span>
            <strong>{{ formatPercent(lowestRemainingRatio) }}</strong>
            <span class="summary-hint">{{ lowestLife?.equipmentName || '--' }}</span>
          </div>
        </section>

        <section class="tree-section">
          <div class="section-heading">
            <div>
              <h3>构型设备寿命明细</h3>
              <p>沿用构型树层级展示系统、子系统和设备，设备节点显示实际寿命。</p>
            </div>
            <el-tag type="info" effect="plain">
              {{ lives[0]?.configVersion || '当前构型' }}
            </el-tag>
          </div>

          <el-tree
            v-if="lifeTree.length"
            :data="lifeTree"
            :props="treeProps"
            node-key="itemId"
            default-expand-all
            class="life-tree"
          >
            <template #default="{ data }">
              <div class="life-tree-node">
                <div class="node-identity">
                  <el-tag :type="treeTypeTag(data.itemType)" effect="plain" size="small">
                    {{ itemTypeLabel[data.itemType as ConfigItemType] }}
                  </el-tag>
                  <span class="node-name">{{ treeNodeName(data) }}</span>
                  <span v-if="data.partNumber" class="node-part">{{ data.partNumber }}</span>
                </div>

                <div v-if="data.itemType === 'EQUIPMENT' && data.life" class="node-life">
                  <span>初始 {{ formatHours(data.life.initialLifeHours) }} 小时</span>
                  <span>已用 {{ formatHours(data.life.usedLifeHours) }} 小时</span>
                  <strong>剩余 {{ formatHours(data.life.remainingLifeHours) }} 小时</strong>
                  <el-progress
                    class="node-progress"
                    :percentage="remainingPercent(data.life)"
                    :stroke-width="8"
                    :color="progressColor(data.life)"
                  />
                </div>

                <div v-else-if="data.itemType !== 'EQUIPMENT'" class="node-summary">
                  {{ data.descendantEquipmentCount }} 个设备
                  <template v-if="data.descendantEquipmentCount">
                    · 最低剩余 {{ data.lowestRemainingPercent }}%
                  </template>
                </div>
              </div>
            </template>
          </el-tree>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getAircraftConfigItemLives, getConfigItems } from '@/api/aircraft'
import type {
  AircraftConfigItemLife,
  ConfigItem,
  ConfigItemType,
} from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
  modelCode: string
}>()

const lives = ref<AircraftConfigItemLife[]>([])
const configItems = ref<ConfigItem[]>([])
const loading = ref(false)
const error = ref('')
let requestSequence = 0

interface LifeTreeNode extends ConfigItem {
  children: LifeTreeNode[]
  life: AircraftConfigItemLife | null
  descendantEquipmentCount: number
  lowestRemainingPercent: number
}

const itemTypeLabel: Record<ConfigItemType, string> = {
  SYSTEM: '系统',
  SUBSYSTEM: '子系统',
  EQUIPMENT: '设备',
  LRU: 'LRU',
}

const treeProps = {
  children: 'children',
  label: 'label',
}

const sortedLives = computed(() =>
  [...lives.value].sort((a, b) => remainingRatio(a) - remainingRatio(b)),
)

const totalRemaining = computed(() =>
  lives.value.reduce((sum, item) => sum + Number(item.remainingLifeHours || 0), 0),
)

const totalUsed = computed(() =>
  lives.value.reduce((sum, item) => sum + Number(item.usedLifeHours || 0), 0),
)

const lowestLife = computed(() => sortedLives.value[0] ?? null)

const lowestRemainingRatio = computed(() =>
  lowestLife.value ? remainingRatio(lowestLife.value) : 0,
)

const lifeTree = computed<LifeTreeNode[]>(() => {
  const lifeByItemId = new Map(lives.value.map((life) => [life.itemId, life]))
  const nodeById = new Map<number, LifeTreeNode>()
  for (const item of configItems.value) {
    nodeById.set(item.itemId, {
      ...item,
      children: [],
      life: lifeByItemId.get(item.itemId) ?? null,
      descendantEquipmentCount: 0,
      lowestRemainingPercent: 100,
    })
  }
  const roots: LifeTreeNode[] = []
  for (const node of nodeById.values()) {
    const parent = node.parentItemId == null ? null : nodeById.get(node.parentItemId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  for (const root of roots) calculateAggregates(root)
  return roots
})

async function loadLives() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const [rows, items] = await Promise.all([
      getAircraftConfigItemLives(props.aircraftNumber),
      getConfigItems(props.modelCode),
    ])
    if (sequence !== requestSequence) return
    lives.value = rows
    configItems.value = items
  } catch (e) {
    if (sequence !== requestSequence) return
    lives.value = []
    configItems.value = []
    error.value = `加载设备寿命失败：${(e as Error).message}`
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function remainingRatio(item: AircraftConfigItemLife) {
  const initial = Number(item.initialLifeHours || 0)
  const remaining = Number(item.remainingLifeHours || 0)
  if (initial <= 0) return 0
  return Math.max(0, Math.min(1, remaining / initial))
}

function remainingPercent(item: AircraftConfigItemLife) {
  return Math.round(remainingRatio(item) * 100)
}

function calculateAggregates(node: LifeTreeNode): {
  count: number
  lowest: number
} {
  if (node.itemType === 'EQUIPMENT') {
    const percent = node.life ? remainingPercent(node.life) : 0
    node.descendantEquipmentCount = 1
    node.lowestRemainingPercent = percent
    return { count: 1, lowest: percent }
  }
  let count = 0
  let lowest = 100
  for (const child of node.children) {
    const aggregate = calculateAggregates(child)
    count += aggregate.count
    if (aggregate.count > 0) lowest = Math.min(lowest, aggregate.lowest)
  }
  node.descendantEquipmentCount = count
  node.lowestRemainingPercent = count > 0 ? lowest : 0
  return { count, lowest }
}

function progressColor(item: AircraftConfigItemLife) {
  const percent = remainingPercent(item)
  if (percent >= 50) return '#23806f'
  if (percent >= 20) return '#d97706'
  return '#c2413a'
}

function treeNodeName(item: ConfigItem) {
  if (item.itemType === 'SYSTEM') return item.systemName || '未命名系统'
  if (item.itemType === 'SUBSYSTEM') return item.subSystemName || '未命名子系统'
  return item.equipmentName || `设备 ${item.itemId}`
}

function treeTypeTag(
  type: ConfigItemType,
): 'primary' | 'success' | 'info' {
  if (type === 'SYSTEM') return 'primary'
  if (type === 'SUBSYSTEM') return 'success'
  return 'info'
}

function formatHours(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('zh-CN')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

watch(
  () => [props.aircraftNumber, props.modelCode],
  loadLives,
)

onMounted(loadLives)
</script>

<style scoped>
.life-page {
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

.page-error {
  margin: 0 24px 12px;
}

.page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 15px 17px;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  background: #fff;
}

.summary-label {
  color: #7f8c9f;
  font-size: 12px;
}

.summary-cell strong {
  min-width: 0;
  overflow: hidden;
  color: #0d1f3c;
  font-size: 22px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-hint {
  min-width: 0;
  overflow: hidden;
  color: #9aa7b8;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-section {
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

.life-tree {
  width: 100%;
}

.life-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 52px;
  padding: 6px 0;
  border-bottom: 1px solid #eef2f6;
}

.life-tree :deep(.el-tree-node__content:hover) {
  background: #f7faf9;
}

.life-tree-node {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 3px 8px;
}

.node-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.node-name {
  min-width: 0;
  overflow: hidden;
  color: #1d2b2a;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-part {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f4f3;
  color: #8c9ab0;
  font-size: 11px;
}

.node-life {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: auto auto auto minmax(130px, 180px);
  align-items: center;
  gap: 14px;
  color: #6f7f92;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.node-life strong {
  color: #17685a;
}

.node-progress {
  width: 160px;
}

.node-summary {
  flex-shrink: 0;
  color: #8c9ab0;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .page-header {
    padding-right: 16px;
    padding-left: 16px;
  }

  .page-body {
    padding-right: 16px;
    padding-left: 16px;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .page-header {
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .life-tree-node {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .node-life {
    width: 100%;
    grid-template-columns: repeat(3, auto);
  }

  .node-progress {
    width: 100%;
    grid-column: 1 / -1;
  }
}
</style>
