<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import { useConfigItemStore } from '@/stores/configItem'
import { useUnifiedStore } from '@/stores/unified'
import { unifiedApi, sourceText } from '@/api/unified'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ConfigItem, ConfigItemType, UnifiedConfigRow, UnifiedSource } from '@/types/entities'
import ConfigForceGraph from '@/components/ConfigForceGraph.vue'

const aircraftStore = useAircraftStore()
const configItemStore = useConfigItemStore()
const unifiedStore = useUnifiedStore()

// ---- 构型选择 ----
const selectedModelCode = ref('')

// ---- 视图模式：树形 / 力导向图（仅本地构型有） ----
const viewMode = ref<'tree' | 'graph'>('tree')

/** 当前机型是否存在于本地：存在才允许本地构型增删管理 */
const hasLocalModel = computed(() =>
  aircraftStore.models.some((m) => m.modelCode === selectedModelCode.value),
)

// 机型下拉 = 统一三源机型（含外源独有机型）+ 本地机型兜底去重（按 modelCode）
const modelOptions = computed(() => {
  const map = new Map<string, string>()
  const setLabel = (code?: string, extra?: string | null) => {
    if (!code || map.has(code)) return
    map.set(code, extra ? `${code} (${extra})` : code)
  }
  for (const m of unifiedStore.models) setLabel(m.modelCode, m.manufacturer)
  for (const m of aircraftStore.models) setLabel(m.modelCode, m.description || m.manufacturer)
  return [...map.entries()].map(([value, label]) => ({ value, label }))
})

onMounted(async () => {
  await Promise.all([aircraftStore.fetchModels(), unifiedStore.fetchModels()])
  if (!selectedModelCode.value) {
    const first = aircraftStore.models[0]?.modelCode || unifiedStore.models[0]?.modelCode || ''
    selectedModelCode.value = first
    applySelection(first)
  }
})

// ---- 外部平台构型（只读，按当前机型 modelCode 聚合） ----
const extLoading = ref(false)
const extRows = ref<UnifiedConfigRow[]>([])

async function loadExternal(modelCode: string) {
  if (!modelCode) {
    extRows.value = []
    return
  }
  extLoading.value = true
  try {
    const res = await unifiedApi.queryConfig({ modelCode })
    // 本地构型已在上方展示，这里只取外源行
    extRows.value = res.data.filter((r) => r.source !== 'local')
  } catch {
    extRows.value = []
  } finally {
    extLoading.value = false
  }
}

type ExtNode = UnifiedConfigRow & { children: ExtNode[] }

/** 由 nodeId/parentNodeId 建树；父节点不在集合内或 parent 为空视为根 */
function buildForest(rows: UnifiedConfigRow[]): ExtNode[] {
  const nodes = new Map<string, ExtNode>()
  rows.forEach((r) => nodes.set(r.nodeId, { ...r, children: [] }))
  const roots: ExtNode[] = []
  for (const r of rows) {
    const n = nodes.get(r.nodeId)!
    if (r.parentNodeId && nodes.has(r.parentNodeId)) {
      nodes.get(r.parentNodeId)!.children.push(n)
    } else {
      roots.push(n)
    }
  }
  return roots
}

/** 外源构型按 来源 → 机号 → 树 分组 */
const externalGroups = computed(() => {
  const bySource = new Map<UnifiedSource, Map<string, UnifiedConfigRow[]>>()
  for (const r of extRows.value) {
    let planes = bySource.get(r.source)
    if (!planes) {
      planes = new Map()
      bySource.set(r.source, planes)
    }
    const ac = r.aircraftNo?.trim() || '未标注机号'
    planes.set(ac, [...(planes.get(ac) ?? []), r])
  }
  return [...bySource.entries()].map(([source, planes]) => ({
    source,
    planes: [...planes.entries()].map(([aircraftNo, rows]) => ({
      aircraftNo,
      trees: buildForest(rows),
    })),
  }))
})

function applySelection(modelCode: string) {
  if (!modelCode) return
  if (hasLocalModel.value) {
    configItemStore.fetchAll(modelCode)
  }
  loadExternal(modelCode)
}

function onModelChange(modelCode: string) {
  applySelection(modelCode)
}

// ---- 新建构型项目弹窗 ----
const configDialogVisible = ref(false)
const parentContext = ref<{
  itemId: number
  itemType: ConfigItemType
  systemName?: string
} | null>(null)
const itemName = ref('')
const configForm = ref({
  parentItemId: null as number | null,
  gjbChapter: '',
  partNumber: '' as string | null,
  itemType: 'SYSTEM' as ConfigItemType,
})

function openCreateConfig(parentId?: number, parentType?: ConfigItemType, parentSystemName?: string) {
  if (parentId && parentType) {
    parentContext.value = { itemId: parentId, itemType: parentType, systemName: parentSystemName }
    configForm.value.parentItemId = parentId
    // 根据父节点类型设置默认 itemType
    if (parentType === 'SYSTEM') {
      configForm.value.itemType = 'SUBSYSTEM'
    } else if (parentType === 'SUBSYSTEM') {
      configForm.value.itemType = 'EQUIPMENT'
    }
  } else {
    parentContext.value = null
    configForm.value.parentItemId = null
    configForm.value.itemType = 'SYSTEM'
  }
  itemName.value = ''
  configForm.value.gjbChapter = ''
  configForm.value.partNumber = null
  configDialogVisible.value = true
}

// 根据父节点上下文决定可选的项目类型
const allowedItemTypes = computed(() => {
  if (!parentContext.value) {
    // 工具栏"添加项目"：全部类型可选
    return configItemStore.itemTypeOptions
  }
  if (parentContext.value.itemType === 'SYSTEM') {
    return configItemStore.itemTypeOptions.filter(
      (opt) => opt.value === 'SUBSYSTEM' || opt.value === 'EQUIPMENT' || opt.value === 'LRU',
    )
  }
  if (parentContext.value.itemType === 'SUBSYSTEM') {
    return configItemStore.itemTypeOptions.filter(
      (opt) => opt.value === 'EQUIPMENT' || opt.value === 'LRU',
    )
  }
  return []
})

async function submitConfig() {
  if (!itemName.value.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }
  if (!configForm.value.gjbChapter.trim()) {
    ElMessage.warning('请输入 GJB 章节号')
    return
  }

  const type = configForm.value.itemType
  const base = {
    itemType: type,
    ataChapter: configForm.value.gjbChapter.trim(),
    parentItemId: configForm.value.parentItemId,
  }

  if (type === 'SYSTEM') {
    await configItemStore.createItem({
      ...base,
      systemName: itemName.value.trim(),
    })
  } else if (type === 'SUBSYSTEM') {
    await configItemStore.createItem({
      ...base,
      subSystemName: itemName.value.trim(),
    })
  } else {
    // EQUIPMENT / LRU
    await configItemStore.createItem({
      ...base,
      equipmentName: itemName.value.trim(),
      partNumber: configForm.value.partNumber?.trim() || null,
    })
  }

  ElMessage.success('构型项目已创建')
  configDialogVisible.value = false
}

async function handleDeleteCurrentModel() {
  try {
    await ElMessageBox.confirm(
      `确定要删除构型"${selectedModelCode.value}"及其所有构型项目吗？此操作不可撤销。`,
      '删除构型确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await aircraftStore.deleteModel(selectedModelCode.value)
    ElMessage.success('构型已删除')
    selectedModelCode.value = ''
    if (aircraftStore.models.length > 0) {
      selectedModelCode.value = aircraftStore.models[0].modelCode
      configItemStore.fetchAll(selectedModelCode.value)
    }
  } catch { /* cancelled */ }
}

async function handleDeleteConfigItem(itemId: number, label: string) {
  try {
    await ElMessageBox.confirm(
      `确定要删除构型项目"${label}"吗？若存在子项目将一并删除。`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await configItemStore.deleteItem(itemId)
    ElMessage.success('构型项目已删除')
  } catch { /* cancelled */ }
}

// ---- 力导向图事件 → 复用既有增删逻辑 ----
function onGraphAddChild(item: ConfigItem) {
  openCreateConfig(item.itemId, item.itemType, item.systemName ?? undefined)
}
function onGraphDelete(item: ConfigItem) {
  handleDeleteConfigItem(item.itemId, treeNodeName(item) || item.ataChapter)
}
function onGraphSelect(_item: ConfigItem | null) {
  // 预留：选中态由图组件内部维护，此处暂不处理
}

const treeProps = {
  children: 'children',
  label: 'systemName',
}

const extTreeProps = {
  children: 'children',
  label: 'nodeName',
}

function treeNodeName(data: ConfigItem): string {
  if (data.itemType === 'SUBSYSTEM') return data.subSystemName ?? ''
  if (data.itemType === 'EQUIPMENT' || data.itemType === 'LRU') return data.equipmentName ?? ''
  return data.systemName ?? ''
}
</script>

<template>
  <div class="config-management">
    <div class="page-header">
      <h2 class="page-title">构型管理</h2>
    </div>

    <!-- 构型选择器 -->
    <div class="aircraft-selector">
      <el-select
        v-model="selectedModelCode"
        placeholder="请选择构型"
        style="width: 320px"
        filterable
        @change="onModelChange"
      >
        <el-option
          v-for="opt in modelOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </div>

    <!-- 未选择构型时的提示 -->
    <div v-if="!selectedModelCode" class="empty-hint">
      <span class="empty-icon">🔧</span>
      <p>请先选择构型，查看和管理其构型项目</p>
    </div>

    <!-- 已选择构型后的构型管理 -->
    <template v-else>
      <!-- 本地机型：本地构型管理工具栏 -->
      <div v-if="hasLocalModel" class="toolbar">
        <span class="current-model">当前构型：{{ selectedModelCode }}</span>
        <div class="toolbar-actions">
          <el-radio-group v-model="viewMode" size="default">
            <el-radio-button value="tree">树形</el-radio-button>
            <el-radio-button value="graph">构型图谱</el-radio-button>
          </el-radio-group>
          <el-button type="danger" @click="handleDeleteCurrentModel">
            删除当前构型
          </el-button>
          <el-button type="primary" @click="openCreateConfig()">
            + 添加项目
          </el-button>
        </div>
      </div>

      <!-- 外源独有机型：无本地管理，仅提示 -->
      <div v-else class="readonly-banner">
        <span class="banner-model">当前构型：{{ selectedModelCode }}</span>
        <span class="banner-tip">该机型来自外部平台，本地无构型，仅可查看下方外部平台构型</span>
      </div>

      <div class="config-scroll">
        <!-- 本地构型白卡（仅本地机型可管理编辑） -->
        <div
          v-if="hasLocalModel"
          class="tree-container"
          :class="{ 'graph-mode': viewMode === 'graph' && configItemStore.treeData.length > 0 }"
        >
          <!-- 加载中 -->
          <div
            v-if="configItemStore.loading"
            class="inner-empty"
            v-loading="configItemStore.loading"
            style="min-height: 200px"
          ></div>

          <!-- 空状态 -->
          <div v-else-if="configItemStore.treeData.length === 0" class="inner-empty">
            <p>该构型暂无构型项目，点击上方按钮开始构建</p>
          </div>

          <!-- 构型树 -->
          <el-tree
            v-else-if="viewMode === 'tree'"
            :data="configItemStore.treeData"
            :props="treeProps"
            node-key="itemId"
            default-expand-all
            highlight-current
          >
            <template #default="{ data }">
              <div class="tree-node-content">
                <span class="tree-node-label">{{ data.ataChapter }}</span>
                <span class="tree-node-name">{{ treeNodeName(data) }}</span>
                <el-tag
                  :type="data.itemType === 'SYSTEM' ? '' : data.itemType === 'SUBSYSTEM' ? 'success' : 'info'"
                  class="tree-type-tag"
                >
                  {{ configItemStore.itemTypeLabel[data.itemType as ConfigItemType] }}
                </el-tag>
                <span v-if="data.partNumber" class="tree-pn">{{ data.partNumber }}</span>

                <span class="tree-actions">
                  <el-button
                    v-if="data.itemType === 'SYSTEM' || data.itemType === 'SUBSYSTEM'"
                    type="primary"
                    text
                    size="small"
                    @click.stop="openCreateConfig(data.itemId, data.itemType, data.systemName)"
                  >
                    添加子项
                  </el-button>
                  <el-button
                    type="danger"
                    text
                    size="small"
                    @click.stop="handleDeleteConfigItem(
                      data.itemId,
                      treeNodeName(data) || data.ataChapter
                    )"
                  >
                    删除
                  </el-button>
                </span>
              </div>
            </template>
          </el-tree>

          <!-- 力导向图 -->
          <div v-else class="graph-holder">
            <ConfigForceGraph
              :tree="configItemStore.treeData"
              :root-label="selectedModelCode"
              @select="onGraphSelect"
              @add-child="onGraphAddChild"
              @delete="onGraphDelete"
              @add-root-child="openCreateConfig"
            />
          </div>
        </div>

        <!-- 外部平台构型：每平台一张卡片（航新 / 633） -->
        <div class="platform-area" v-loading="extLoading">
          <div v-if="!extLoading && externalGroups.length === 0" class="platform-empty">
            该机型暂无外部平台构型
          </div>

          <template v-else>
            <div
              v-for="group in externalGroups"
              :key="group.source"
              class="platform-card"
            >
              <div class="platform-head">
                <span class="platform-tag" :class="`src-${group.source}`">
                  {{ sourceText(group.source) }}
                </span>
              </div>

              <div
                v-for="plane in group.planes"
                :key="`${group.source}-${plane.aircraftNo}`"
                class="platform-plane"
              >
                <div class="platform-plane-title">机号：{{ plane.aircraftNo }}</div>
                <el-tree
                  :data="plane.trees"
                  :props="extTreeProps"
                  node-key="nodeId"
                  default-expand-all
                  highlight-current
                >
                  <template #default="{ data }">
                    <div class="ext-node-row">
                      <span class="ext-node-name">{{ data.nodeName }}</span>
                      <el-tag
                        v-if="data.nodeType"
                        type="info"
                        class="ext-type-tag"
                      >
                        {{ data.nodeType }}
                      </el-tag>
                      <span class="ext-node-meta">
                        <span v-if="data.equipmentNo" class="ext-meta-item">设备号：{{ data.equipmentNo }}</span>
                        <span v-if="data.partNumber" class="ext-meta-item">件号：{{ data.partNumber }}</span>
                        <span v-if="data.installPosition" class="ext-meta-item">安装位置：{{ data.installPosition }}</span>
                      </span>
                    </div>
                  </template>
                </el-tree>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- 新建构型项目弹窗 -->
    <el-dialog
      v-model="configDialogVisible"
      title="添加构型项目"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="itemName" placeholder="请输入项目名称" />
        </el-form-item>

        <el-form-item label="项目类型" required>
          <el-select v-model="configForm.itemType" style="width: 100%">
            <el-option
              v-for="opt in allowedItemTypes"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="GJB 章节号" required>
          <el-input v-model="configForm.gjbChapter" placeholder="例：72-00" />
        </el-form-item>

        <el-form-item
          v-if="configForm.itemType === 'EQUIPMENT' || configForm.itemType === 'LRU'"
          label="件号"
        >
          <el-input v-model="configForm.partNumber" placeholder="例：PN-7200-01" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitConfig">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.config-management {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 24px 32px 0;
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.aircraft-selector {
  padding: 0 32px 16px;
  flex-shrink: 0;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #bcc5d0;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-hint p {
  font-size: 15px;
  margin: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px 16px;
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  gap: 16px;
}

.toolbar-actions .el-button + .el-button {
  margin-left: 0;
}

.current-model {
  font-size: 14px;
  color: #6a7a90;
  font-weight: 500;
}

/* 内容滚动区：本地构型卡 + 各外部平台卡 */
.config-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 32px 24px;
}

/* 本地构型白卡 */
.tree-container {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e0e8f5;
  padding: 20px;
  margin-bottom: 16px;
}

/* 外源独有机型提示条 */
.readonly-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 32px 16px;
  padding: 10px 16px;
  background: #fff8e6;
  border: 1px solid #f5e0a3;
  border-radius: 8px;
  font-size: 13px;
  flex-shrink: 0;
}

.banner-model {
  color: #8a6d1a;
  font-weight: 700;
  white-space: nowrap;
}

.banner-tip {
  color: #a0863a;
}

/* 力导向图模式：图铺满白卡、固定高度；下方各平台卡随整区滚动 */
.tree-container.graph-mode {
  padding: 0;
  overflow: hidden;
}

.graph-holder {
  height: 62vh;
  min-height: 520px;
}

/* ---- 外部平台卡片区：每平台一张卡片 ---- */
.platform-area {
  position: relative;
  min-height: 80px;
}

.platform-empty {
  background: #fff;
  border: 1px dashed #dfe6f0;
  border-radius: 10px;
  padding: 40px 0;
  text-align: center;
  color: #bcc5d0;
  font-size: 14px;
}

.platform-card {
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.platform-card:last-child {
  margin-bottom: 0;
}

.platform-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.platform-tag {
  display: inline-block;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  padding: 3px 12px;
  border-radius: 999px;
}

.platform-tag.src-hangxin {
  background: #0ea5e9;
}

.platform-tag.src-sansan {
  background: #f59e0b;
}

.platform-tag.src-local {
  background: #1a6cf0;
}

.platform-plane-title {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: #3a4a5c;
  background: #f0f4fa;
  border-radius: 6px;
  padding: 5px 10px;
  margin-bottom: 4px;
}

/* 外源树行：与本地构型树同一套格式标准 */
.platform-card :deep(.el-tree-node__content) {
  height: auto !important;
  min-height: unset;
}

.platform-card :deep(.el-tree-node) {
  margin: 2px 0;
}

.ext-node-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
  font-size: 20px;
  height: 40px;
  padding: 0 4px;
  min-width: 0;
}

.ext-node-name {
  color: #0d1f3c;
  font-weight: 500;
  white-space: nowrap;
}

.ext-type-tag {
  margin-left: 4px;
  flex-shrink: 0;
}

.ext-node-meta {
  margin-left: auto;
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.ext-meta-item {
  font-size: 12px;
  color: #8c9ab0;
  white-space: nowrap;
}

/* 穿透 el-tree 内部高度限制 */
.tree-container :deep(.el-tree-node__content) {
  height: auto !important;
  min-height: unset;
}

.tree-container :deep(.el-tree-node) {
  margin: 2px 0;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
  font-size: 20px;
  height: 40px;
  padding: 0 4px;
  min-width: 0;
}

.tree-node-label {
  font-weight: 600;
  color: #1a6cf0;
  white-space: nowrap;
}

.tree-node-name {
  color: #0d1f3c;
  font-weight: 500;
}

.tree-sep {
  color: #c0c8d4;
}

.tree-node-sub {
  color: #3a4a5c;
}

.tree-node-equip {
  color: #5a6a7c;
}

.tree-type-tag {
  margin-left: 4px;
  flex-shrink: 0;
}

.tree-pn {
  font-size: 12px;
  color: #8c9ab0;
  background: #f0f3f8;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.tree-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-actions :deep(.el-button) {
  font-size: 16px;
}

.tree-node-content:hover .tree-actions {
  opacity: 1;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}
</style>
