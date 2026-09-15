<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import { useConfigItemStore } from '@/stores/configItem'
import { isLocalModelCode } from '@/utils/model-code'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ConfigItem, ConfigItemType } from '@/types/entities'
import ConfigForceGraph from '@/components/ConfigForceGraph.vue'

const aircraftStore = useAircraftStore()
const configItemStore = useConfigItemStore()

// ---- 机型下拉：本地机型 + 第三方平台架号（SSFJH）两组 ----
// 选项 value 带来源前缀，避免本地机型编码与架号恰好同名时走错分支
const LOCAL_PREFIX = 'local:'
const THIRD_PREFIX = 'third:'
const selectedValue = ref('')

// 「本地机型」组 = GET /aircraft/models 中的本地机型；外源机型编码含 ':'（如 JX-20AS:1），不在此列
const localModelOptions = computed(() => {
  const seen = new Set<string>()
  for (const m of aircraftStore.models) {
    if (m.modelCode && isLocalModelCode(m.modelCode)) seen.add(m.modelCode)
  }
  return [...seen].map((value) => ({ value: LOCAL_PREFIX + value, label: value }))
})

// 「第三方平台」组 = 全部第三方构型里的 SSFJH（后端映射 SSFJH→modelCode，store 已去重）
const thirdSsfjhOptions = computed(() =>
  configItemStore.thirdSsfjhList.map((value) => ({ value: THIRD_PREFIX + value, label: value })),
)

const modelOptionGroups = computed(() => [
  { category: '本地机型', items: localModelOptions.value },
  { category: '第三方平台', items: thirdSsfjhOptions.value },
])

const hasSelection = computed(() => selectedValue.value !== '')
const isThird = computed(() => selectedValue.value.startsWith(THIRD_PREFIX))

/** 下拉选中值 → 裸编码（本地机型编码 / 架号） */
function selectedCodeOf(value: string): string {
  if (value.startsWith(LOCAL_PREFIX)) return value.slice(LOCAL_PREFIX.length)
  if (value.startsWith(THIRD_PREFIX)) return value.slice(THIRD_PREFIX.length)
  return ''
}

const selectedCode = computed(() => selectedCodeOf(selectedValue.value))

// ---- 视图模式：树形 / 力导向图（仅本地构型有） ----
const viewMode = ref<'tree' | 'graph'>('tree')

function applySelection(value: string) {
  const code = selectedCodeOf(value)
  if (!code) return
  // 第三方平台：点架号时把 modelCode 传成该架号，只读
  if (value.startsWith(THIRD_PREFIX)) {
    configItemStore.fetchSsfjhItems(code)
    return
  }
  configItemStore.fetchAll(code)
}

function onModelChange(value: string) {
  applySelection(value)
}

onMounted(async () => {
  // 进页面即取全部第三方构型，架号用于下拉的「第三方平台」组
  await Promise.all([aircraftStore.fetchModels(), configItemStore.fetchThirdItems()])
  // 沿用原交互：默认选中首个本地机型；没有本地机型则保持空态
  const first = localModelOptions.value[0]?.value || ''
  if (first) {
    selectedValue.value = first
    applySelection(first)
  }
})

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
    gjbChapter: configForm.value.gjbChapter.trim(),
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
      `确定要删除构型"${selectedCode.value}"及其所有构型项目吗？此操作不可撤销。`,
      '删除构型确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await aircraftStore.deleteModel(selectedCode.value)
    ElMessage.success('构型已删除')
    // deleteModel 内部已刷新机型列表，这里改选删除后的首个本地机型
    selectedValue.value = ''
    const next = localModelOptions.value[0]?.value || ''
    if (next) {
      selectedValue.value = next
      applySelection(next)
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
  handleDeleteConfigItem(item.itemId, treeNodeName(item) || item.gjbChapter)
}
function onGraphSelect(_item: ConfigItem | null) {
  // 预留：选中态由图组件内部维护，此处暂不处理
}

const treeProps = {
  children: 'children',
  label: 'systemName',
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

    <!-- 机型选择器：本地机型走本地构型，第三方平台下是各架号（SSFJH） -->
    <div class="aircraft-selector">
      <el-select
        v-model="selectedValue"
        placeholder="请选择机型 / 架号"
        style="width: 320px"
        filterable
        @change="onModelChange"
      >
        <el-option-group
          v-for="group in modelOptionGroups"
          :key="group.category"
          :label="group.category"
        >
          <el-option
            v-for="opt in group.items"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-option-group>
      </el-select>
    </div>

    <!-- 未选机型时的提示 -->
    <div v-if="!hasSelection" class="empty-hint">
      <span class="empty-icon">🔧</span>
      <p>请先选择机型，查看和管理其本地构型项目</p>
    </div>

    <!-- 本地构型管理 -->
    <template v-else-if="!isThird">
      <div class="toolbar">
        <span class="current-model">当前构型：{{ selectedCode }}</span>
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

      <div class="config-scroll">
        <!-- 本地构型白卡 -->
        <div
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
                <span class="tree-node-label">{{ data.gjbChapter }}</span>
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
                      treeNodeName(data) || data.gjbChapter
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
              :root-label="selectedCode"
              @select="onGraphSelect"
              @add-child="onGraphAddChild"
              @delete="onGraphDelete"
              @add-root-child="openCreateConfig"
            />
          </div>
        </div>

      </div>
    </template>

    <!-- 第三方构型：选中某个架号后展示其全部部件（只读，无增删入口） -->
    <div v-else class="third-area" v-loading="configItemStore.ssfjhLoading">
      <div class="third-summary">
        第三方构型 · 架号 {{ selectedCode }} · 共 {{ configItemStore.ssfjhItems.length }} 个部件
      </div>

      <el-table
        :data="configItemStore.ssfjhItems"
        class="third-table"
        empty-text="该架号暂无构型数据"
      >
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <span class="third-node-name">{{ treeNodeName(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.itemType === 'SYSTEM' ? '' : row.itemType === 'SUBSYSTEM' ? 'success' : 'info'"
            >
              {{ configItemStore.itemTypeLabel[row.itemType as ConfigItemType] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="件号" min-width="180">
          <template #default="{ row }">{{ row.partNumber || '—' }}</template>
        </el-table-column>
      </el-table>
    </div>

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
  display: flex;
  align-items: center;
  gap: 12px;
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

/* 本地构型内容滚动区 */
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

/* 力导向图模式：图铺满白卡、固定高度 */
.tree-container.graph-mode {
  padding: 0;
  overflow: hidden;
}

.graph-holder {
  height: 62vh;
  min-height: 520px;
}

/* ---- 第三方构型区：不传 modelCode 的全量结果（只读表格） ---- */
.third-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 32px 24px;
}

.third-summary {
  font-size: 13px;
  color: #6a7a90;
  font-weight: 500;
  margin-bottom: 12px;
}

.third-table {
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
}

.third-node-name {
  color: #0d1f3c;
  font-weight: 500;
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
