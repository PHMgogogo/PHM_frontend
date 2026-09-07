<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  externalPlatformApi,
  PLATFORM_TYPES,
  PLATFORM_TYPE_LABELS,
  platformNameToType,
  type PlatformType,
} from '@/api/externalPlatform'
import type { ApiResponse, ExternalPlatform } from '@/types/entities'

// ============================================================
// 外来平台配置管理
// 管理第三方平台（航新服务 / 633服务）的接入地址配置，
// 每类平台全局唯一，支持增删改查 + 连通性测试。
// ============================================================

const list = ref<ExternalPlatform[]>([])
const loading = ref(false)

async function fetchList() {
  loading.value = true
  try {
    list.value = await externalPlatformApi.list()
  } catch (e) {
    ElMessage.error((e as Error).message || '加载平台配置失败')
  } finally {
    loading.value = false
  }
}
onMounted(fetchList)

/** 已配置的平台类型集合（每类唯一，用于新增时屏蔽已占用类型） */
const existingTypes = computed(
  () =>
    new Set<PlatformType>(
      list.value
        .map((r) => platformNameToType(r.platformName))
        .filter((t): t is PlatformType => !!t),
    ),
)

/** 写/读接口共用的表单校验：IP 格式 */
const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

const ipRules = [
  { required: true, message: '请输入 IP 地址', trigger: 'blur' },
  {
    validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
      if (v && !ipRegex.test(v)) cb(new Error('IP 地址格式不正确'))
      else cb()
    },
    trigger: 'blur',
  },
]
const portRules = [
  { required: true, message: '请输入端口号', trigger: 'blur' },
  {
    validator: (_r: unknown, v: number | undefined, cb: (e?: Error) => void) => {
      if (v == null) cb(new Error('请输入端口号'))
      else if (v < 1 || v > 65535) cb(new Error('端口号需在 1-65535 之间'))
      else cb()
    },
    trigger: 'blur',
  },
]

// ============================================================
// 新增 / 编辑弹窗
// ============================================================
type Mode = 'create' | 'edit'
const dialogVisible = ref(false)
const dialogMode = ref<Mode>('create')
const editingId = ref<number | null>(null)
const submitting = ref(false)
const formTestLoading = ref(false)

const formRef = ref<FormInstance>()
const form = reactive({
  platform: '' as PlatformType | '',
  ip: '',
  port: undefined as number | undefined,
})

/** 平台下拉选项：新增时只给未占用的类型；编辑时仅当前类型（后端要求沿用原枚举） */
const platformOptions = computed(() => {
  if (dialogMode.value === 'edit') {
    return PLATFORM_TYPES.filter((t) => t === form.platform)
  }
  return PLATFORM_TYPES.filter((t) => !existingTypes.value.has(t))
})

const dialogTitle = computed(() =>
  dialogMode.value === 'create' ? '新增平台配置' : '编辑平台配置',
)

const dialogRules: FormRules = {
  platform: [{ required: true, message: '请选择平台类型', trigger: 'change' }],
  ip: ipRules,
  port: portRules,
}

function resetForm() {
  form.platform = ''
  form.ip = ''
  form.port = undefined
  formRef.value?.clearValidate()
}

function openCreate() {
  if (platformOptions.value.length === 0) {
    ElMessage.warning('航新服务 / 633服务 均已配置，如需新增请先删除对应配置')
    return
  }
  dialogMode.value = 'create'
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: ExternalPlatform) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.platform = platformNameToType(row.platformName) ?? ''
  form.ip = row.platformIp
  form.port = row.port
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

async function submitForm() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid || !form.platform || form.port == null) return

  const payload = { platform: form.platform, ip: form.ip.trim(), port: form.port }
  submitting.value = true
  try {
    const res =
      dialogMode.value === 'create'
        ? await externalPlatformApi.create(payload)
        : await externalPlatformApi.update(editingId.value!, payload)
    if (res.success === false) {
      throw new Error(res.error || res.message || '保存失败')
    }
    ElMessage.success(dialogMode.value === 'create' ? '平台配置已新增' : '平台配置已更新')
    dialogVisible.value = false
    await fetchList()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    submitting.value = false
  }
}

/** 弹窗内「测试连通性」：用当前表单的 ip+port 探测，不保存 */
async function testCurrentForm() {
  if (!form.ip.trim()) return ElMessage.warning('请先填写 IP 地址')
  if (form.port == null) return ElMessage.warning('请先填写端口号')
  formTestLoading.value = true
  try {
    const res = await externalPlatformApi.testByAddress({ ip: form.ip.trim(), port: form.port })
    if (res.success === false) throw new Error(res.error || res.message || '连接失败')
    ElMessage.success(res.message || '连接成功')
  } catch (e) {
    ElMessage.error((e as Error).message || '连接失败')
  } finally {
    formTestLoading.value = false
  }
}

// ============================================================
// 行内操作：编辑 / 测试 / 删除
// ============================================================
const testingId = ref<number | null>(null)

async function runRowTest(row: ExternalPlatform) {
  testingId.value = row.id
  try {
    const res = await externalPlatformApi.testById(row.id)
    if (res.success === false) throw new Error(res.error || res.message || '连接失败')
    ElMessage.success(res.message || `「${row.platformName}」连接成功`)
  } catch (e) {
    ElMessage.error((e as Error).message || '连接失败')
  } finally {
    testingId.value = null
  }
}

async function handleDelete(row: ExternalPlatform) {
  try {
    await ElMessageBox.confirm(
      `确定删除平台配置「${row.platformName}」（${row.platformIp}:${row.port}）吗？删除后该平台将无法接入。`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }
  try {
    const res = await externalPlatformApi.remove(row.id)
    if (res.success === false) throw new Error(res.error || res.message || '删除失败')
    ElMessage.success('平台配置已删除')
    await fetchList()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// ============================================================
// 顶部「连通性测试」小弹窗：纯 ip+port 探测，不保存
// ============================================================
const probeVisible = ref(false)
const probeTesting = ref(false)
const probeFormRef = ref<FormInstance>()
const probeForm = reactive({
  ip: '',
  port: undefined as number | undefined,
})
const probeRules: FormRules = { ip: ipRules, port: portRules }

function openProbe() {
  probeForm.ip = ''
  probeForm.port = undefined
  probeFormRef.value?.clearValidate()
  probeVisible.value = true
}

async function runProbe() {
  if (!probeFormRef.value) return
  const valid = await probeFormRef.value.validate().catch(() => false)
  if (!valid || probeForm.port == null) return
  probeTesting.value = true
  try {
    const res = await externalPlatformApi.testByAddress({
      ip: probeForm.ip.trim(),
      port: probeForm.port,
    })
    if (res.success === false) throw new Error(res.error || res.message || '连接失败')
    ElMessage.success(res.message || '连接成功')
  } catch (e) {
    ElMessage.error((e as Error).message || '连接失败')
  } finally {
    probeTesting.value = false
  }
}
</script>

<template>
  <div class="external-platform">
    <div class="page-header">
      <h2 class="page-title">外来平台配置管理</h2>
    </div>

    <div class="toolbar">
      <div class="toolbar-actions">
        <el-button @click="openProbe">连通性测试</el-button>
        <el-button type="primary" @click="openCreate">+ 新增平台</el-button>
      </div>
    </div>

    <div class="table-card">
      <el-table :data="list" v-loading="loading" class="ext-table" empty-text="暂无平台配置">
        <el-table-column prop="id" label="ID" width="90" align="center" />
        <el-table-column prop="platformName" label="平台名称" min-width="160" />
        <el-table-column prop="platformIp" label="IP 地址" min-width="160" />
        <el-table-column prop="port" label="端口" width="120" align="center" />
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button
              size="small"
              :loading="testingId === row.id"
              @click="runRowTest(row)"
            >
              测试
            </el-button>
            <el-button type="danger" text size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="520px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="dialogRules" label-width="90px">
        <el-form-item label="平台类型" prop="platform">
          <el-select
            v-model="form.platform"
            placeholder="请选择平台类型"
            style="width: 100%"
            :disabled="dialogMode === 'edit'"
          >
            <el-option
              v-for="t in platformOptions"
              :key="t"
              :label="PLATFORM_TYPE_LABELS[t]"
              :value="t"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="IP 地址" prop="ip">
          <el-input v-model="form.ip" placeholder="请输入平台服务 IP 地址" class="ip-center" />
        </el-form-item>

        <el-form-item label="端口" prop="port">
          <el-input-number
            v-model="form.port"
            :min="1"
            :max="65535"
            :precision="0"
            :controls="false"
            style="width: 100%"
            placeholder="请输入端口号"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button
          :loading="formTestLoading"
          @click="testCurrentForm"
        >
          测试连通性
        </el-button>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 纯连通性探测弹窗（不保存） -->
    <el-dialog
      v-model="probeVisible"
      title="连通性测试"
      width="460px"
      :close-on-click-modal="false"
    >
      <p class="probe-desc">
        输入目标平台服务的 IP 与端口进行探测，该测试不保存任何配置。
      </p>
      <el-form ref="probeFormRef" :model="probeForm" :rules="probeRules" label-width="90px">
        <el-form-item label="IP 地址" prop="ip">
          <el-input v-model="probeForm.ip" placeholder="请输入目标 IP 地址" class="ip-center" />
        </el-form-item>

        <el-form-item label="端口" prop="port">
          <el-input-number
            v-model="probeForm.port"
            :min="1"
            :max="65535"
            :precision="0"
            :controls="false"
            style="width: 100%"
            placeholder="请输入端口号"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="probeVisible = false">关闭</el-button>
        <el-button type="primary" :loading="probeTesting" @click="runProbe">
          开始测试
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.external-platform {
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

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 32px 16px;
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.table-card {
  flex: 1;
  min-height: 0;
  margin: 0 32px 32px;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.ext-table {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.probe-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: #6a7a90;
  line-height: 1.6;
}

/* 两个弹窗中的 IP 输入框文字水平居中 */
.ip-center :deep(.el-input__inner) {
  text-align: center;
}

</style>
