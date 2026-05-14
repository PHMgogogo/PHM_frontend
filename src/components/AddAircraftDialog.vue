<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAircraftStore } from '@/stores/aircraft'
import type { AircraftConfig } from '@/stores/aircraft'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'created'): void
}>()

const store = useAircraftStore()

const AIRCRAFT_TYPES = ['固定翼', '旋翼机', '无人机', '运输机', '战斗机', '侦察机']

// 表单数据
const form = reactive({
  name: '',
  type: '',
  configId: '',
})

const formRef = ref()
const rules = {
  name: [{ required: true, message: '请输入飞行器名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择飞行器属性', trigger: 'change' }],
}

// 构型管理面板展开状态
const showConfigPanel = ref(false)

// 新建构型表单
const newConfig = reactive({
  configName: '',
  mappings: [{ key: '飞行时间', value: '' }] as { key: string; value: string }[],
})
const newConfigRef = ref()
const newConfigRules = {
  configName: [{ required: true, message: '请输入构型名称', trigger: 'blur' }],
}

// 校验飞行时间映射是否填写
function validateMappings() {
  const flightTimeRow = newConfig.mappings.find((m) => m.key === '飞行时间')
  if (!flightTimeRow || !flightTimeRow.value.trim()) {
    ElMessage.warning('"飞行时间"字段的列号为必填项')
    return false
  }
  // 过滤掉空行
  const filled = newConfig.mappings.filter((m) => m.key.trim() && m.value.trim())
  if (filled.length === 0) {
    ElMessage.warning('请至少填写一条有效映射')
    return false
  }
  return true
}

function addMappingRow() {
  newConfig.mappings.push({ key: '', value: '' })
}

function removeMappingRow(index: number) {
  if (newConfig.mappings[index].key === '飞行时间') {
    ElMessage.warning('"飞行时间"字段不可删除')
    return
  }
  newConfig.mappings.splice(index, 1)
}

async function submitNewConfig() {
  try {
    await newConfigRef.value?.validate()
  } catch {
    return
  }
  if (!validateMappings()) return

  const mappings: Record<string, string> = {}
  newConfig.mappings.forEach((m) => {
    if (m.key.trim() && m.value.trim()) {
      mappings[m.key.trim()] = m.value.trim()
    }
  })

  const created = store.addConfig({ configName: newConfig.configName, mappings })
  form.configId = created.id
  ElMessage.success(`构型"${created.configName}"已创建并选中`)

  // 重置新建构型表单
  newConfig.configName = ''
  newConfig.mappings = [{ key: '飞行时间', value: '' }]
  showConfigPanel.value = false
}

async function handleDeleteConfig(config: AircraftConfig) {
  try {
    await ElMessageBox.confirm(`确定要删除构型"${config.configName}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    store.deleteConfig(config.id)
    if (form.configId === config.id) form.configId = ''
    ElMessage.success('构型已删除')
  } catch {
    // 取消
  }
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  const selectedConfig = store.configs.find((c) => c.id === form.configId)
  store.addAircraft({
    name: form.name,
    type: form.type,
    configId: form.configId || undefined,
    configName: selectedConfig?.configName,
  })
  ElMessage.success('飞行器已添加')
  emit('created')
  handleClose()
}

function handleClose() {
  emit('update:visible', false)
  // 重置
  form.name = ''
  form.type = ''
  form.configId = ''
  showConfigPanel.value = false
  newConfig.configName = ''
  newConfig.mappings = [{ key: '飞行时间', value: '' }]
  formRef.value?.clearValidate()
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="添加飞行器"
    width="600px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
    class="aircraft-dialog"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="aircraft-form">
      <!-- 飞行器名称 -->
      <el-form-item label="飞行器名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入飞行器名称" clearable />
      </el-form-item>

      <!-- 飞行器属性 -->
      <el-form-item label="飞行器属性" prop="type">
        <el-select v-model="form.type" placeholder="请选择飞行器属性" style="width: 100%">
          <el-option v-for="t in AIRCRAFT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>

      <!-- 所属构型 -->
      <el-form-item label="所属构型">
        <div class="config-select-row">
          <el-select
            v-model="form.configId"
            placeholder="请选择构型（可选）"
            clearable
            style="flex: 1"
          >
            <el-option
              v-for="c in store.configs"
              :key="c.id"
              :label="c.configName"
              :value="c.id"
            />
          </el-select>
          <el-button
            type="primary"
            plain
            @click="showConfigPanel = !showConfigPanel"
            style="white-space: nowrap"
          >
            {{ showConfigPanel ? '收起构型管理' : '管理构型' }}
          </el-button>
        </div>
      </el-form-item>
    </el-form>

    <!-- 构型管理内嵌面板 -->
    <transition name="panel-fade">
      <div v-if="showConfigPanel" class="config-panel">
        <div class="config-panel-header">
          <span>构型管理</span>
        </div>

        <!-- 已有构型列表 -->
        <div class="existing-configs">
          <div v-if="store.configs.length === 0" class="no-configs">暂无构型</div>
          <div
            v-for="config in store.configs"
            :key="config.id"
            class="config-list-item"
            :class="{ selected: form.configId === config.id }"
            @click="form.configId = config.id"
          >
            <div class="config-item-left">
              <span class="config-item-name">{{ config.configName }}</span>
              <span class="config-item-mappings">
                {{ Object.keys(config.mappings).join(' · ') }}
              </span>
            </div>
            <el-button
              type="danger"
              plain
              size="small"
              @click.stop="handleDeleteConfig(config)"
            >
              删除
            </el-button>
          </div>
        </div>

        <!-- 新建构型表单 -->
        <div class="new-config-section">
          <div class="new-config-title">新建构型</div>
          <el-form
            ref="newConfigRef"
            :model="newConfig"
            :rules="newConfigRules"
            label-width="80px"
            class="new-config-form"
          >
            <el-form-item label="构型名称" prop="configName">
              <el-input v-model="newConfig.configName" placeholder="请输入构型名称" clearable />
            </el-form-item>

            <el-form-item label="字段映射">
              <div class="mapping-table">
                <div class="mapping-header">
                  <span>业务字段名</span>
                  <span>数据列号</span>
                  <span></span>
                </div>
                <div
                  v-for="(row, index) in newConfig.mappings"
                  :key="index"
                  class="mapping-row"
                >
                  <el-input
                    v-model="row.key"
                    placeholder="字段名"
                    :disabled="row.key === '飞行时间' && index === 0"
                    size="small"
                  />
                  <el-input
                    v-model="row.value"
                    placeholder="列号"
                    size="small"
                    type="number"
                  />
                  <el-button
                    type="danger"
                    link
                    size="small"
                    :disabled="row.key === '飞行时间' && index === 0"
                    @click="removeMappingRow(index)"
                  >
                    删除
                  </el-button>
                </div>
                <el-button type="primary" link size="small" @click="addMappingRow">
                  + 添加字段
                </el-button>
              </div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" size="small" @click="submitNewConfig">保存构型</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </transition>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.aircraft-form {
  padding: 8px 0;
}

.config-select-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.config-panel {
  margin: 0 0 16px;
  border: 1px solid #d4e3fb;
  border-radius: 8px;
  overflow: hidden;
  background: #f6f9ff;
}

.config-panel-header {
  background: #1a6cf0;
  color: #fff;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
}

.existing-configs {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.no-configs {
  color: #bcc5d0;
  font-size: 13px;
  text-align: center;
  padding: 8px 0;
}

.config-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e0e8f5;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.config-list-item:hover {
  border-color: #1a6cf0;
}

.config-list-item.selected {
  border-color: #1a6cf0;
  background: #eaf1ff;
}

.config-item-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
}

.config-item-mappings {
  font-size: 11px;
  color: #8c9ab0;
}

.new-config-section {
  border-top: 1px solid #d4e3fb;
  padding: 12px 16px;
}

.new-config-title {
  font-size: 13px;
  font-weight: 600;
  color: #3a4a5c;
  margin-bottom: 10px;
}

.new-config-form {
  background: transparent;
}

.mapping-table {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mapping-header {
  display: grid;
  grid-template-columns: 1fr 1fr 48px;
  gap: 6px;
  font-size: 11px;
  color: #8c9ab0;
  padding: 0 2px;
}

.mapping-row {
  display: grid;
  grid-template-columns: 1fr 1fr 48px;
  gap: 6px;
  align-items: center;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s, max-height 0.3s;
  max-height: 600px;
  overflow: hidden;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
