<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import { useConfigItemStore } from '@/stores/configItem'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ConfigItem, ConfigItemType } from '@/types/entities'
import ConfigForceGraph from '@/components/ConfigForceGraph.vue'

const aircraftStore = useAircraftStore()
const configItemStore = useConfigItemStore()

onMounted(async () => {
  await aircraftStore.fetchModels()
  if (aircraftStore.models.length > 0 && !selectedModelCode.value) {
    selectedModelCode.value = aircraftStore.models[0].modelCode
    configItemStore.fetchAll(selectedModelCode.value)
  }
})

// ---- 构型选择 ----
const selectedModelCode = ref('')

// ---- 视图模式：树形 / 力导向图 ----
const viewMode = ref<'tree' | 'graph'>('tree')

const modelOptions = computed(() =>
  aircraftStore.models.map((m) => ({
    value: m.modelCode,
    label: `${m.modelCode}` + (m.description ? ` (${m.description})` : ''),
  })),
)

function onModelChange(modelCode: string) {
  if (modelCode) {
    configItemStore.fetchAll(modelCode)
  }
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
      <div class="toolbar">
        <span class="current-model">当前构型：{{ selectedModelCode }}</span>
        <div class="toolbar-actions">
          <el-radio-group v-model="viewMode" size="default">
            <el-radio-button value="tree">树形</el-radio-button>
            <el-radio-button value="graph">力导向图</el-radio-button>
          </el-radio-group>
          <el-button type="danger" @click="handleDeleteCurrentModel">
            删除当前构型
          </el-button>
          <el-button type="primary" @click="openCreateConfig()">
            + 添加项目
          </el-button>
        </div>
      </div>

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

      <!-- 构型树 / 力导向图 -->
      <div v-else class="tree-container" :class="{ 'graph-mode': viewMode === 'graph' }">
        <el-tree
          v-if="viewMode === 'tree'"
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

        <ConfigForceGraph
          v-else
          :tree="configItemStore.treeData"
          :root-label="selectedModelCode"
          @select="onGraphSelect"
          @add-child="onGraphAddChild"
          @delete="onGraphDelete"
          @add-root-child="openCreateConfig"
        />
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

.tree-container {
  flex: 1;
  overflow-y: auto;
  margin: 0 32px 32px;
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid #e0e8f5;
}

/* 力导向图模式下，让 SVG 撑满整张卡片 */
.tree-container.graph-mode {
  padding: 0;
  overflow: hidden;
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
