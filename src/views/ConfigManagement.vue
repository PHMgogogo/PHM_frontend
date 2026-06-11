<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import { useConfigItemStore } from '@/stores/configItem'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ConfigItemType } from '@/types/entities'

const aircraftStore = useAircraftStore()
const configItemStore = useConfigItemStore()

onMounted(() => {
  aircraftStore.fetchAircrafts()
})

// ---- 飞行器/机型选择 ----
const selectedAircraftNumber = ref('')

const aircraftOptions = computed(() =>
  aircraftStore.aircrafts.map((a) => ({
    value: a.aircraftNumber,
    label: `${a.aircraftNumber}（${a.modelCode}）`,
    modelCode: a.modelCode,
  })),
)

const selectedModelCode = computed(() => {
  const a = aircraftStore.aircrafts.find(
    (ac) => ac.aircraftNumber === selectedAircraftNumber.value,
  )
  return a?.modelCode ?? ''
})

// 切换飞机时重新加载构型数据
function onAircraftChange(val: string) {
  const a = aircraftStore.aircrafts.find((ac) => ac.aircraftNumber === val)
  if (a?.modelCode) {
    configItemStore.fetchAll(a.modelCode)
  }
}

// ---- 新建构型项目弹窗 ----
const configDialogVisible = ref(false)
const configForm = ref({
  parentItemId: null as number | null,
  ataChapter: '',
  systemName: '',
  subSystemName: '' as string | null,
  equipmentName: '' as string | null,
  partNumber: '' as string | null,
  itemType: 'SYSTEM' as ConfigItemType,
})

function openCreateConfig(parentId?: number) {
  configForm.value = {
    parentItemId: parentId ?? null,
    ataChapter: '',
    systemName: '',
    subSystemName: null,
    equipmentName: null,
    partNumber: null,
    itemType: parentId ? 'SUBSYSTEM' : 'SYSTEM',
  }
  configDialogVisible.value = true
}

async function submitConfig() {
  if (!configForm.value.ataChapter.trim()) {
    ElMessage.warning('请输入 ATA 章节号')
    return
  }
  if (configForm.value.itemType === 'SYSTEM' && !configForm.value.systemName.trim()) {
    ElMessage.warning('请输入系统名称')
    return
  }
  await configItemStore.createItem({
    modelCode: selectedModelCode.value,
    parentItemId: configForm.value.parentItemId,
    ataChapter: configForm.value.ataChapter.trim(),
    systemName: configForm.value.systemName.trim(),
    subSystemName: configForm.value.subSystemName || null,
    equipmentName: configForm.value.equipmentName || null,
    partNumber: configForm.value.partNumber || null,
    itemType: configForm.value.itemType,
  })
  ElMessage.success('构型项目已创建')
  configDialogVisible.value = false
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

// 获取可选的父节点（根据当前 itemType）
const availableParents = computed(() => {
  const t = configForm.value.itemType
  if (t === 'SYSTEM') return []
  if (t === 'SUBSYSTEM') return configItemStore.selectList.filter((i) => i.itemType === 'SYSTEM')
  return configItemStore.selectList.filter(
    (i) => i.itemType === 'SYSTEM' || i.itemType === 'SUBSYSTEM',
  )
})

// 树节点渲染
const treeProps = {
  children: 'children',
  label: 'systemName',
}
</script>

<template>
  <div class="config-management">
    <div class="page-header">
      <h2 class="page-title">构型管理</h2>
    </div>

    <!-- 飞行器选择器 -->
    <div class="aircraft-selector">
      <el-select
        v-model="selectedAircraftNumber"
        placeholder="请选择飞行器 / 机型"
        style="width: 320px"
        filterable
        @change="onAircraftChange"
      >
        <el-option
          v-for="opt in aircraftOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </div>

    <!-- 未选择飞行器时的提示 -->
    <div v-if="!selectedAircraftNumber" class="empty-hint">
      <span class="empty-icon">🔧</span>
      <p>请先选择飞行器，查看和管理其构型项目</p>
    </div>

    <!-- 已选择飞行器后的构型管理 -->
    <template v-else>
      <div class="toolbar">
        <span class="current-model">当前机型：{{ selectedModelCode }}</span>
        <el-button type="primary" @click="openCreateConfig()">
          <el-icon><Plus /></el-icon> 添加系统
        </el-button>
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
        <p>该机型暂无构型项目，点击上方按钮开始构建</p>
      </div>

      <!-- 构型树 -->
      <div v-else class="tree-container">
        <el-tree
          :data="configItemStore.treeData"
          :props="treeProps"
          node-key="itemId"
          default-expand-all
          highlight-current
        >
          <template #default="{ data }">
            <div class="tree-node-content">
              <span class="tree-node-label">{{ data.ataChapter }}</span>
              <span class="tree-node-name">{{ data.systemName }}</span>
              <template v-if="data.subSystemName">
                <span class="tree-sep">/</span>
                <span class="tree-node-sub">{{ data.subSystemName }}</span>
              </template>
              <template v-if="data.equipmentName">
                <span class="tree-sep">/</span>
                <span class="tree-node-equip">{{ data.equipmentName }}</span>
              </template>
              <el-tag
                size="small"
                :type="data.itemType === 'SYSTEM' ? '' : data.itemType === 'SUBSYSTEM' ? 'success' : 'info'"
                class="tree-type-tag"
              >
                {{ configItemStore.itemTypeLabel[data.itemType as ConfigItemType] }}
              </el-tag>
              <span v-if="data.partNumber" class="tree-pn">{{ data.partNumber }}</span>

              <span class="tree-actions">
                <el-button
                  v-if="data.itemType !== 'LRU'"
                  type="primary"
                  link
                  size="small"
                  @click.stop="openCreateConfig(data.itemId)"
                >
                  添加子项
                </el-button>
                <el-button
                  type="danger"
                  link
                  size="small"
                  @click.stop="handleDeleteConfigItem(
                    data.itemId,
                    data.systemName || data.ataChapter
                  )"
                >
                  删除
                </el-button>
              </span>
            </div>
          </template>
        </el-tree>
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
        <el-form-item label="项目类型" required>
          <el-select v-model="configForm.itemType" style="width: 100%">
            <el-option
              v-for="opt in configItemStore.itemTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="configForm.itemType !== 'SYSTEM'" label="父节点">
          <el-select
            v-model="configForm.parentItemId"
            placeholder="请选择父节点"
            style="width: 100%"
            filterable
            clearable
          >
            <el-option
              v-for="p in availableParents"
              :key="p.itemId"
              :label="p.label"
              :value="p.itemId"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="ATA 章节号" required>
          <el-input v-model="configForm.ataChapter" placeholder="例：72-00" />
        </el-form-item>

        <el-form-item label="系统名称" required>
          <el-input v-model="configForm.systemName" placeholder="例：发动机" />
        </el-form-item>

        <el-form-item
          v-if="configForm.itemType === 'SUBSYSTEM' || configForm.itemType === 'EQUIPMENT' || configForm.itemType === 'LRU'"
          label="子系统名称"
        >
          <el-input v-model="configForm.subSystemName" placeholder="例：燃油系统" />
        </el-form-item>

        <el-form-item
          v-if="configForm.itemType === 'EQUIPMENT' || configForm.itemType === 'LRU'"
          label="设备名称"
        >
          <el-input v-model="configForm.equipmentName" placeholder="例：高压油泵" />
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

.current-model {
  font-size: 13px;
  color: #8c9ab0;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  margin: 0 32px 32px;
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #e0e8f5;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
  padding: 2px 0;
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
  font-size: 11px;
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
