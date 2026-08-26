<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { algorithmApi } from '@/api/algorithm'
import ProxyRuleEditor from '@/components/ProxyRuleEditor.vue'
import type {
  AlgorithmDetail,
  AlgorithmTree,
  CreateInstanceRequest,
  InstanceDetail,
  InstanceInfo,
  ProcessConnection,
  Template,
  UrlProxyRule,
} from '@/types/entities'

const route = useRoute()
const router = useRouter()

// ============================================================
// 通用工具
// ============================================================

interface TreeNode {
  label: string
  path: string
  isDir: boolean
  /** 是否为叶子节点（文件，或没有子目录的空目录），用于隐藏展开箭头 */
  isLeaf: boolean
  children?: TreeNode[]
}

const treeProps = { children: 'children', label: 'label' }

/** 判断后端树节点是否为目录（值为嵌套对象） */
function isDirNode(child: AlgorithmTree | null | undefined): boolean {
  return child !== null && typeof child === 'object'
}

/** 把后端返回的嵌套文件树转换为 el-tree 节点结构（递归构建完整树） */
function treeToNodes(tree: AlgorithmTree | undefined, basePath = ''): TreeNode[] {
  if (!tree) return []
  return Object.entries(tree).map(([name, child]) => {
    const path = basePath ? `${basePath}/${name}` : name
    const isDir = isDirNode(child)
    return {
      label: name,
      path,
      isDir,
      // 文件或空目录视为叶子，不显示展开箭头
      isLeaf: !isDir || Object.keys(child as AlgorithmTree).length === 0,
      children: isDir ? treeToNodes(child as AlgorithmTree, path) : undefined,
    }
  })
}

// ============================================================
// 路由驱动的 Tab 与选中项
// ============================================================

/** 当前 tab 由路由决定：/algo/files | /algo/config | /algo/instances */
const activeTab = computed(() => {
  const name = route.name
  if (name === 'algo-config') return 'config'
  if (name === 'algo-instances') return 'instances'
  return 'files'
})

/** 当前路由中的选中 id（算法/模板/实例） */
const routeId = computed(() => (route.params.id as string | undefined) ?? '')

/** 切换 tab：跳转到对应路由（id 为各 tab 独立，切换时不携带） */
function switchTab(tab: string) {
  const baseMap: Record<string, string> = {
    files: '/algo/files',
    config: '/algo/config',
    instances: '/algo/instances',
  }
  router.push(baseMap[tab] ?? '/algo/files')
}

// ============================================================
// Tab 1：算法文件
// ============================================================

const algorithms = ref<string[]>([])
const algorithmsLoading = ref(false)
const selectedAlgorithm = ref<AlgorithmDetail | null>(null)
const algorithmTree = ref<TreeNode[]>([])
const algorithmLoading = ref(false)
const uploadVisible = ref(false)
const uploadForm = ref({
  version: '',
  description: '',
  auto_unpack_topdir: true,
})
const uploadFile = ref<File | null>(null)
const uploading = ref(false)

async function fetchAlgorithms() {
  algorithmsLoading.value = true
  try {
    algorithms.value = (await algorithmApi.listAlgorithms()).sort()
    // 若当前选中项已不存在则清空
    if (selectedAlgorithm.value && !algorithms.value.includes(selectedAlgorithm.value.id)) {
      selectedAlgorithm.value = null
      algorithmTree.value = []
    }
  } catch (e) {
    ElMessage.error(`获取算法列表失败：${(e as Error).message}`)
  } finally {
    algorithmsLoading.value = false
  }
}

/** 点击算法 → 更新 URL → 加载详情 → 渲染文件树 */
async function selectAlgorithm(id: string) {
  if (routeId.value !== id) {
    router.push(`/algo/files/${encodeURIComponent(id)}`)
  } else {
    await loadAlgorithm(id)
  }
}

async function loadAlgorithm(id: string) {
  algorithmLoading.value = true
  try {
    const algo = await algorithmApi.getAlgorithm(id)
    selectedAlgorithm.value = algo
    algorithmTree.value = treeToNodes(algo.tree)
  } catch (e) {
    ElMessage.error(`获取算法详情失败：${(e as Error).message}`)
  } finally {
    algorithmLoading.value = false
  }
}

function onUploadFileChange(file: File) {
  uploadFile.value = file
}

async function submitUpload() {
  if (!uploadFile.value) {
    ElMessage.warning('请选择要上传的算法 zip 包')
    return
  }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', uploadFile.value)
    form.append('version', uploadForm.value.version)
    form.append('description', uploadForm.value.description)
    form.append('auto_unpack_topdir', String(uploadForm.value.auto_unpack_topdir))
    const algo = await algorithmApi.uploadAlgorithm(form)
    ElMessage.success(`算法 ${algo.id} 上传成功`)
    uploadVisible.value = false
    uploadFile.value = null
    uploadForm.value = { version: '', description: '', auto_unpack_topdir: true }
    await fetchAlgorithms()
    await selectAlgorithm(algo.id)
  } catch (e) {
    ElMessage.error(`上传失败：${(e as Error).message}`)
  } finally {
    uploading.value = false
  }
}

// ---- 算法"编辑信息" ----
const editAlgorithmVisible = ref(false)
const editingAlgorithm = ref(false)
const editAlgorithmForm = ref({
  version: '',
  description: '',
  base_on: '',
  ignores: '',
})

function openEditAlgorithm() {
  if (!selectedAlgorithm.value) return
  editAlgorithmForm.value = {
    version: selectedAlgorithm.value.version ?? '',
    description: selectedAlgorithm.value.description ?? '',
    base_on: selectedAlgorithm.value.base_on ?? '',
    ignores: (selectedAlgorithm.value.ignores ?? []).join('\n'),
  }
  editAlgorithmVisible.value = true
}

async function submitEditAlgorithm() {
  if (!selectedAlgorithm.value) return
  editingAlgorithm.value = true
  try {
    const body: Partial<AlgorithmDetail> = {
      version: editAlgorithmForm.value.version,
      description: editAlgorithmForm.value.description,
      base_on: editAlgorithmForm.value.base_on,
      ignores: editAlgorithmForm.value.ignores
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    await algorithmApi.updateAlgorithm(selectedAlgorithm.value.id, body)
    ElMessage.success('算法信息已更新')
    editAlgorithmVisible.value = false
    await selectAlgorithm(selectedAlgorithm.value.id)
  } catch (e) {
    ElMessage.error(`更新算法信息失败：${(e as Error).message}`)
  } finally {
    editingAlgorithm.value = false
  }
}

// ============================================================
// Tab 2：算法配置（模板）
// ============================================================

const templates = ref<string[]>([])
const templatesLoading = ref(false)
const templateDetails = ref<Record<string, Template>>({})
const selectedTemplate = ref<Template | null>(null)
const createTemplateVisible = ref(false)
const creatingTemplate = ref(false)
const templateForm = ref({
  algorithm_id: '',
  id: '',
  entry: 'python main.py',
  restart_always: false,
  restart_interval_seconds: 10,
  volume: false,
  bind_listener: false,
})

async function fetchTemplates() {
  templatesLoading.value = true
  try {
    templates.value = (await algorithmApi.listTemplates()).sort()
    // 并行拉取每个模板详情
    const entries = await Promise.all(
      templates.value.map(async (id) => {
        try {
          return [id, await algorithmApi.getTemplate(id)] as const
        } catch {
          return [id, null] as const
        }
      }),
    )
    templateDetails.value = {}
    for (const [id, tpl] of entries) {
      if (tpl) templateDetails.value[id] = tpl
    }
  } catch (e) {
    ElMessage.error(`获取模板列表失败：${(e as Error).message}`)
  } finally {
    templatesLoading.value = false
  }
}

/** 点击模板 → 更新 URL → 展示详情 */
function selectTemplate(id: string) {
  if (routeId.value !== id) {
    router.push(`/algo/config/${encodeURIComponent(id)}`)
  } else {
    selectedTemplate.value = templateDetails.value[id] ?? null
  }
}

function openCreateTemplate() {
  templateForm.value = {
    algorithm_id: algorithms.value[0] ?? '',
    id: '',
    entry: 'python main.py',
    restart_always: false,
    restart_interval_seconds: 10,
    volume: false,
    bind_listener: false,
  }
  createTemplateVisible.value = true
}

async function submitCreateTemplate() {
  if (!templateForm.value.algorithm_id) {
    ElMessage.warning('请选择算法')
    return
  }
  creatingTemplate.value = true
  try {
    const body: Template = {
      algorithm: { id: templateForm.value.algorithm_id } as AlgorithmDetail,
      entry: templateForm.value.entry,
      restart_always: templateForm.value.restart_always,
      id: templateForm.value.id || undefined as unknown as string,
      is_temporary: false,
      restart_interval_seconds: templateForm.value.restart_interval_seconds,
      volume: templateForm.value.volume,
      bind_listener: templateForm.value.bind_listener,
      rules: [],
      tags: [],
    }
    await algorithmApi.createTemplate(body)
    ElMessage.success('模板创建成功')
    createTemplateVisible.value = false
    await fetchTemplates()
  } catch (e) {
    ElMessage.error(`创建模板失败：${(e as Error).message}`)
  } finally {
    creatingTemplate.value = false
  }
}

async function handleDeleteTemplate(id: string) {
  try {
    await ElMessageBox.confirm(`确定要删除模板"${id}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await algorithmApi.deleteTemplate(id)
    ElMessage.success('模板已删除')
    await fetchTemplates()
  } catch { /* cancelled */ }
}

// ---- 模板"编辑配置" ----
const editTemplateVisible = ref(false)
const editingTemplate = ref(false)
const editTemplateForm = ref({
  entry: 'python main.py',
  restart_always: false,
  restart_interval_seconds: 10,
  volume: false,
  bind_listener: false,
})

function openEditTemplate() {
  if (!selectedTemplate.value) return
  editTemplateForm.value = {
    entry: selectedTemplate.value.entry ?? 'python main.py',
    restart_always: selectedTemplate.value.restart_always ?? false,
    restart_interval_seconds: selectedTemplate.value.restart_interval_seconds ?? 10,
    volume: selectedTemplate.value.volume ?? false,
    bind_listener: selectedTemplate.value.bind_listener ?? false,
  }
  editTemplateVisible.value = true
}

async function submitEditTemplate() {
  if (!selectedTemplate.value) return
  editingTemplate.value = true
  try {
    const body: Partial<Template> = {
      entry: editTemplateForm.value.entry,
      restart_always: editTemplateForm.value.restart_always,
      restart_interval_seconds: editTemplateForm.value.restart_interval_seconds,
      volume: editTemplateForm.value.volume,
      bind_listener: editTemplateForm.value.bind_listener,
    }
    await algorithmApi.updateTemplate(selectedTemplate.value.id, body)
    ElMessage.success('模板配置已更新')
    editTemplateVisible.value = false
    await fetchTemplates()
    selectedTemplate.value = templateDetails.value[selectedTemplate.value.id] ?? null
  } catch (e) {
    ElMessage.error(`更新模板配置失败：${(e as Error).message}`)
  } finally {
    editingTemplate.value = false
  }
}

// ---- 模板"代理规则"内联编辑 ----
const editingTemplateRules = ref(false)
const savingTemplateRules = ref(false)
const templateRulesDraft = ref<UrlProxyRule[]>([])

function startEditTemplateRules() {
  if (!selectedTemplate.value) return
  templateRulesDraft.value = (selectedTemplate.value.rules ?? []).map((r) => ({ ...r }))
  editingTemplateRules.value = true
}

function cancelEditTemplateRules() {
  editingTemplateRules.value = false
  templateRulesDraft.value = []
}

async function saveTemplateRules() {
  if (!selectedTemplate.value) return
  savingTemplateRules.value = true
  try {
    const body: Partial<Template> = { rules: templateRulesDraft.value }
    await algorithmApi.updateTemplate(selectedTemplate.value.id, body)
    ElMessage.success('代理规则已保存')
    editingTemplateRules.value = false
    templateRulesDraft.value = []
    await fetchTemplates()
    selectedTemplate.value = templateDetails.value[selectedTemplate.value.id] ?? null
  } catch (e) {
    ElMessage.error(`保存代理规则失败：${(e as Error).message}`)
  } finally {
    savingTemplateRules.value = false
  }
}

// ============================================================
// Tab 3：运行中算法（实例）
// ============================================================

const instances = ref<InstanceInfo[]>([])
const instancesLoading = ref(false)
const createInstanceVisible = ref(false)
const creatingInstance = ref(false)
const instanceForm = ref<CreateInstanceRequest>({ template_id: '' })
const instanceDetailVisible = ref(false)
const instanceDetail = ref<InstanceDetail | null>(null)
const instanceConnections = ref<ProcessConnection[]>([])
const detailLoading = ref(false)
const logDialogVisible = ref(false)
const logInstanceId = ref('')
const logActiveTab = ref<'out' | 'err'>('out')
const logContent = ref('')
const logLoading = ref(false)
const logViewerRef = ref<HTMLElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchInstances() {
  try {
    const list = await algorithmApi.listInstances()
    instances.value = [...list].sort((a, b) => a.id.localeCompare(b.id))
  } catch (e) {
    // 轮询时静默失败，避免频繁弹错
    if (!pollTimer) ElMessage.error(`获取实例列表失败：${(e as Error).message}`)
  }
}

function openCreateInstance() {
  instanceForm.value = { template_id: templates.value[0] ?? '' }
  createInstanceVisible.value = true
}

async function submitCreateInstance() {
  if (!instanceForm.value.template_id) {
    ElMessage.warning('请选择模板')
    return
  }
  creatingInstance.value = true
  try {
    const res = await algorithmApi.createInstance(instanceForm.value)
    ElMessage.success(`实例 ${res.instance_id} 已启动`)
    createInstanceVisible.value = false
    await fetchInstances()
  } catch (e) {
    ElMessage.error(`创建实例失败：${(e as Error).message}`)
  } finally {
    creatingInstance.value = false
  }
}

async function handleStopInstance(id: string) {
  try {
    await algorithmApi.stopInstance(id)
    ElMessage.success('实例已停止')
    await fetchInstances()
  } catch (e) {
    ElMessage.error(`停止实例失败：${(e as Error).message}`)
  }
}

async function handleStartInstance(id: string) {
  try {
    await algorithmApi.startInstance(id)
    ElMessage.success('实例已启动')
    await fetchInstances()
  } catch (e) {
    ElMessage.error(`启动实例失败：${(e as Error).message}`)
  }
}

async function handleDeleteInstance(id: string) {
  try {
    await ElMessageBox.confirm(`确定要删除实例"${id}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await algorithmApi.deleteInstance(id)
    ElMessage.success('实例已删除')
    await fetchInstances()
  } catch { /* cancelled */ }
}

function handlePublishInstance(id: string) {
  algorithmApi.publishInstance(id)
  ElMessage.success('实例已发布，开始下载')
}

async function viewInstanceDetail(id: string) {
  // 更新 URL，使实例详情可被分享/刷新
  if (routeId.value !== id) {
    router.push(`/algo/instances/${encodeURIComponent(id)}`)
    return
  }
  instanceDetailVisible.value = true
  instanceDetail.value = null
  instanceConnections.value = []
  detailLoading.value = true
  try {
    const detail = await algorithmApi.getInstance(id)
    instanceDetail.value = detail
    try {
      const conn = await algorithmApi.getInstanceConnections(id)
      instanceConnections.value = conn.connections ?? []
    } catch { /* 连接信息可选 */ }
  } catch (e) {
    ElMessage.error(`获取实例详情失败：${(e as Error).message}`)
  } finally {
    detailLoading.value = false
  }
}

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  switch (status) {
    case 'RUNNING': return 'success'
    case 'STOP': return 'info'
    case 'EXITED': return 'danger'
    default: return 'warning'
  }
}

/** 实例状态英文 → 中文 */
function statusText(status: string): string {
  switch (status) {
    case 'RUNNING': return '运行中'
    case 'STOP': return '已停止'
    case 'EXITED': return '已退出'
    case 'NOT_READY': return '未就绪'
    default: return status
  }
}

/** 格式化 ISO 时间字符串，空值显示占位符 */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 判断模板是否存在于后端（动态/临时模板可能不存在，此时不应渲染为超链接） */
function templateExists(id: string): boolean {
  return templates.value.includes(id)
}

async function viewInstanceLogs(id: string) {
  logInstanceId.value = id
  logActiveTab.value = 'out'
  logContent.value = ''
  logDialogVisible.value = true
  await loadLogs('out')
}

async function loadLogs(kind: 'out' | 'err') {
  logActiveTab.value = kind
  logLoading.value = true
  try {
    const res = await algorithmApi.getInstanceLogs(logInstanceId.value, kind)
    logContent.value = res.logs || '(空)'
  } catch (e) {
    logContent.value = `读取日志失败：${(e as Error).message}`
  } finally {
    logLoading.value = false
    // 日志默认滚动到底部
    await nextTick()
    if (logViewerRef.value) {
      logViewerRef.value.scrollTop = logViewerRef.value.scrollHeight
    }
  }
}

// ============================================================
// 路由变化 → 加载对应选中项
// ============================================================

/** 根据当前路由加载选中的算法/模板/实例（用于链接跳转、刷新、前进后退） */
async function applyRouteSelection() {
  const id = routeId.value
  const tab = activeTab.value
  if (!id) {
    // 无 id：清空当前 tab 的选中项
    if (tab === 'files') {
      selectedAlgorithm.value = null
      algorithmTree.value = []
    } else if (tab === 'config') {
      selectedTemplate.value = null
    } else {
      instanceDetailVisible.value = false
      instanceDetail.value = null
    }
    return
  }
  if (tab === 'files') {
    await loadAlgorithm(id)
  } else if (tab === 'config') {
    selectedTemplate.value = templateDetails.value[id] ?? null
  } else {
    await viewInstanceDetail(id)
  }
}

watch(
  () => [route.name, route.params.id] as const,
  () => {
    applyRouteSelection()
  },
)

// ============================================================
// 生命周期
// ============================================================

onMounted(async () => {
  await fetchAlgorithms()
  await fetchTemplates()
  await fetchInstances()
  // 实例状态轮询
  pollTimer = setInterval(fetchInstances, 5000)
  // 若 URL 中带 id（如刷新/链接跳转），加载对应选中项
  await applyRouteSelection()
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="algo-management">
    <div class="page-header">
      <h2 class="page-title">算法管理</h2>
    </div>

    <el-tabs :model-value="activeTab" class="algo-tabs" @tab-change="switchTab">
      <!-- ============ Tab 1：算法文件 ============ -->
      <el-tab-pane label="算法文件" name="files">
        <div class="tab-toolbar">
          <el-button type="primary" @click="uploadVisible = true">+ 上传算法</el-button>
        </div>

        <div class="files-layout">
          <!-- 算法列表 -->
          <div class="algo-list" v-loading="algorithmsLoading">
            <div
              v-for="id in algorithms"
              :key="id"
              class="algo-item"
              :class="{ active: selectedAlgorithm?.id === id }"
              @click="selectAlgorithm(id)"
            >
              <span class="algo-item-name">{{ id }}</span>
            </div>
            <div v-if="algorithms.length === 0 && !algorithmsLoading" class="inner-empty">
              <p>暂无算法，点击上方按钮上传</p>
            </div>
          </div>

          <!-- 文件树 -->
          <div class="algo-tree">
            <template v-if="selectedAlgorithm">
              <div class="algo-meta">
                <span class="algo-meta-id">{{ selectedAlgorithm.id }}</span>
                <el-tag size="small">{{ selectedAlgorithm.version || '未设置版本' }}</el-tag>
              </div>
              <p class="algo-desc">{{ selectedAlgorithm.description || '暂无描述' }}</p>
              <div class="algo-info">
                <div class="algo-info-row">
                  <span class="algo-info-label">基于算法</span>
                  <el-tag v-if="selectedAlgorithm.base_on" size="small" type="info">{{ selectedAlgorithm.base_on }}</el-tag>
                  <span v-else class="algo-info-empty">无</span>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">忽略文件</span>
                  <div v-if="selectedAlgorithm.ignores?.length" class="algo-ignores">
                    <el-tag
                      v-for="ig in selectedAlgorithm.ignores"
                      :key="ig"
                      size="small"
                      type="warning"
                      effect="plain"
                    >
                      {{ ig }}
                    </el-tag>
                  </div>
                  <span v-else class="algo-info-empty">无</span>
                </div>
              </div>
              <div class="algo-detail-actions">
                <el-button type="primary" size="small" @click="openEditAlgorithm">
                  编辑信息
                </el-button>
              </div>
              <div class="algo-tree-scroll" v-loading="algorithmLoading">
                <el-tree
                  :key="selectedAlgorithm.id"
                  :data="algorithmTree"
                  :props="treeProps"
                  node-key="path"
                  highlight-current
                >
                  <template #default="{ data }">
                    <span class="tree-file-label">{{ data.label }}</span>
                  </template>
                </el-tree>
              </div>
            </template>
            <div v-else class="inner-empty">
              <p>请选择左侧算法查看其文件</p>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ Tab 2：算法配置 ============ -->
      <el-tab-pane label="算法配置" name="config">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openCreateTemplate">+ 新建配置</el-button>
        </div>

        <div class="files-layout">
          <!-- 模板列表 -->
          <div class="algo-list" v-loading="templatesLoading">
            <div
              v-for="id in templates"
              :key="id"
              class="algo-item"
              :class="{ active: selectedTemplate?.id === id }"
              @click="selectTemplate(id)"
            >
              <span class="algo-item-name">{{ id }}</span>
            </div>
            <div v-if="templates.length === 0 && !templatesLoading" class="inner-empty">
              <p>暂无配置，点击上方按钮新建</p>
            </div>
          </div>

          <!-- 模板详情 -->
          <div class="algo-tree">
            <template v-if="selectedTemplate">
              <div class="algo-meta">
                <span class="algo-meta-id">{{ selectedTemplate.id }}</span>
                <el-tag v-if="selectedTemplate.tags?.length" size="small" type="info" effect="plain">
                  {{ selectedTemplate.tags.join(', ') }}
                </el-tag>
              </div>
              <div class="algo-info">
                <div class="algo-info-row">
                  <span class="algo-info-label">算法</span>
                  <router-link
                    v-if="selectedTemplate.algorithm?.id"
                    :to="`/algo/files/${encodeURIComponent(selectedTemplate.algorithm.id)}`"
                    class="algo-link"
                  >
                    {{ selectedTemplate.algorithm.id }}
                  </router-link>
                  <span v-else class="algo-info-value">-</span>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">启动命令</span>
                  <code class="entry-code">{{ selectedTemplate.entry || '-' }}</code>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">自动重启</span>
                  <el-tag :type="selectedTemplate.restart_always ? 'success' : 'info'" size="small">
                    {{ selectedTemplate.restart_always ? '是' : '否' }}
                  </el-tag>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">重启间隔</span>
                  <span class="algo-info-value">{{ selectedTemplate.restart_interval_seconds }} 秒</span>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">不创建副本</span>
                  <el-tag :type="selectedTemplate.volume ? 'success' : 'info'" size="small">
                    {{ selectedTemplate.volume ? '是' : '否' }}
                  </el-tag>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">监听绑定</span>
                  <el-tag :type="selectedTemplate.bind_listener ? 'success' : 'info'" size="small">
                    {{ selectedTemplate.bind_listener ? '是' : '否' }}
                  </el-tag>
                </div>
                <div class="algo-info-row">
                  <span class="algo-info-label">临时模板</span>
                  <el-tag :type="selectedTemplate.is_temporary ? 'success' : 'info'" size="small">
                    {{ selectedTemplate.is_temporary ? '是' : '否' }}
                  </el-tag>
                </div>
              </div>
              <div class="algo-detail-actions">
                <el-button type="primary" size="small" @click="openEditTemplate">
                  编辑配置
                </el-button>
                <el-button type="danger" size="small" @click="handleDeleteTemplate(selectedTemplate.id)">
                  删除配置
                </el-button>
              </div>
              <div class="rule-section">
                <div class="rule-section-head">
                  <span class="rule-section-title">代理规则</span>
                  <el-button
                    v-if="!editingTemplateRules"
                    type="primary"
                    text
                    size="small"
                    @click="startEditTemplateRules"
                  >
                    编辑规则
                  </el-button>
                </div>
                <ProxyRuleEditor
                  v-if="!editingTemplateRules"
                  :model-value="selectedTemplate.rules ?? []"
                  readonly
                />
                <template v-else>
                  <ProxyRuleEditor v-model="templateRulesDraft" />
                  <div class="rule-section-actions">
                    <el-button size="small" @click="cancelEditTemplateRules">取消</el-button>
                    <el-button
                      type="primary"
                      size="small"
                      :loading="savingTemplateRules"
                      @click="saveTemplateRules"
                    >
                      保存规则
                    </el-button>
                  </div>
                </template>
              </div>
            </template>
            <div v-else class="inner-empty">
              <p>请选择左侧配置查看详情</p>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ Tab 3：运行中算法 ============ -->
      <el-tab-pane label="运行中算法" name="instances">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openCreateInstance">+ 新建实例</el-button>
        </div>

        <el-table :data="instances" v-loading="instancesLoading" class="algo-table">
          <el-table-column prop="id" label="实例 ID" min-width="220" />
          <el-table-column label="模板 ID" min-width="180">
            <template #default="{ row }">
              <router-link
                v-if="templateExists(row.template_id)"
                :to="`/algo/config/${encodeURIComponent(row.template_id)}`"
                class="algo-link"
              >
                {{ row.template_id }}
              </router-link>
              <span v-else class="algo-info-value">{{ row.template_id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="启动时间" min-width="160">
            <template #default="{ row }">{{ formatTime(row.start_time) }}</template>
          </el-table-column>
          <el-table-column label="停止时间" min-width="160">
            <template #default="{ row }">{{ formatTime(row.stop_time) }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="140">
            <template #default="{ row }">
              <div class="tag-list">
                <el-tag
                  v-for="tag in row.template?.tags ?? templateDetails[row.template_id]?.tags ?? []"
                  :key="tag"
                  size="small"
                  type="info"
                  effect="plain"
                >
                  {{ tag }}
                </el-tag>
                <span
                  v-if="!(row.template?.tags?.length ?? templateDetails[row.template_id]?.tags?.length)"
                  class="tag-empty"
                >
                  -
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="340" align="center">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button type="primary" text size="small" @click="viewInstanceDetail(row.id)">
                  详情
                </el-button>
                <el-button type="info" text size="small" @click="viewInstanceLogs(row.id)">
                  日志
                </el-button>
                <el-button type="success" text size="small" @click="handlePublishInstance(row.id)">
                  发布
                </el-button>
                <el-button
                  v-if="row.status === 'RUNNING'"
                  type="warning"
                  text
                  size="small"
                  @click="handleStopInstance(row.id)"
                >
                  停止
                </el-button>
                <el-button
                  v-else
                  type="success"
                  text
                  size="small"
                  @click="handleStartInstance(row.id)"
                >
                  启动
                </el-button>
                <el-button type="danger" text size="small" @click="handleDeleteInstance(row.id)">
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 上传算法弹窗 ============ -->
    <el-dialog v-model="uploadVisible" title="上传算法" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="算法包" required>
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".zip"
            :on-change="(f: any) => onUploadFileChange(f.raw)"
            :on-remove="() => (uploadFile = null)"
          >
            <el-button>选择 zip 文件</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="版本号">
          <el-input v-model="uploadForm.version" placeholder="可选" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="uploadForm.description" placeholder="可选" />
        </el-form-item>
        <el-form-item label="自动解包">
          <el-switch v-model="uploadForm.auto_unpack_topdir" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- ============ 新建配置弹窗 ============ -->
    <el-dialog v-model="createTemplateVisible" title="新建算法配置" width="560px" :close-on-click-modal="false">
      <el-form label-width="120px">
        <el-form-item label="算法" required>
          <el-select v-model="templateForm.algorithm_id" style="width: 100%" filterable>
            <el-option v-for="id in algorithms" :key="id" :label="id" :value="id" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板 ID">
          <el-input v-model="templateForm.id" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input v-model="templateForm.entry" />
        </el-form-item>
        <el-form-item label="自动重启">
          <el-switch v-model="templateForm.restart_always" />
        </el-form-item>
        <el-form-item label="重启间隔(秒)">
          <el-input-number v-model="templateForm.restart_interval_seconds" :min="1" />
        </el-form-item>
        <el-form-item label="不创建副本">
          <el-switch v-model="templateForm.volume" />
        </el-form-item>
        <el-form-item label="监听绑定">
          <el-switch v-model="templateForm.bind_listener" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createTemplateVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingTemplate" @click="submitCreateTemplate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ============ 编辑算法信息弹窗 ============ -->
    <el-dialog v-model="editAlgorithmVisible" title="编辑算法信息" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="版本号">
          <el-input v-model="editAlgorithmForm.version" placeholder="可选" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editAlgorithmForm.description" placeholder="可选" />
        </el-form-item>
        <el-form-item label="基于算法">
          <el-input v-model="editAlgorithmForm.base_on" placeholder="可选" />
        </el-form-item>
        <el-form-item label="忽略文件">
          <el-input
            v-model="editAlgorithmForm.ignores"
            type="textarea"
            :rows="4"
            placeholder="每行一条忽略规则"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editAlgorithmVisible = false">取消</el-button>
        <el-button type="primary" :loading="editingAlgorithm" @click="submitEditAlgorithm">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 编辑配置弹窗 ============ -->
    <el-dialog v-model="editTemplateVisible" title="编辑算法配置" width="560px" :close-on-click-modal="false">
      <el-form label-width="120px">
        <el-form-item label="启动命令">
          <el-input v-model="editTemplateForm.entry" />
        </el-form-item>
        <el-form-item label="自动重启">
          <el-switch v-model="editTemplateForm.restart_always" />
        </el-form-item>
        <el-form-item label="重启间隔(秒)">
          <el-input-number v-model="editTemplateForm.restart_interval_seconds" :min="1" />
        </el-form-item>
        <el-form-item label="不创建副本">
          <el-switch v-model="editTemplateForm.volume" />
        </el-form-item>
        <el-form-item label="监听绑定">
          <el-switch v-model="editTemplateForm.bind_listener" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editTemplateVisible = false">取消</el-button>
        <el-button type="primary" :loading="editingTemplate" @click="submitEditTemplate">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 新建实例弹窗 ============ -->
    <el-dialog v-model="createInstanceVisible" title="新建运行实例" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="模板" required>
          <el-select v-model="instanceForm.template_id" style="width: 100%" filterable>
            <el-option v-for="id in templates" :key="id" :label="id" :value="id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createInstanceVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingInstance" @click="submitCreateInstance">启动</el-button>
      </template>
    </el-dialog>

    <!-- ============ 实例详情弹窗 ============ -->
    <el-dialog v-model="instanceDetailVisible" title="实例详情" width="720px">
      <div v-loading="detailLoading">
        <template v-if="instanceDetail">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="实例 ID">{{ instanceDetail.id }}</el-descriptions-item>
            <el-descriptions-item label="模板 ID">
              <router-link
                v-if="templateExists(instanceDetail.template_id)"
                :to="`/algo/config/${encodeURIComponent(instanceDetail.template_id)}`"
                class="algo-link"
              >
                {{ instanceDetail.template_id }}
              </router-link>
              <span v-else class="algo-info-value">{{ instanceDetail.template_id }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusTagType(instanceDetail.status)" size="small">
                {{ statusText(instanceDetail.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="启动时间">{{ formatTime(instanceDetail.start_time) }}</el-descriptions-item>
            <el-descriptions-item label="停止时间">{{ formatTime(instanceDetail.stop_time) }}</el-descriptions-item>
            <el-descriptions-item label="日志路径">
              <code class="entry-code">{{ instanceDetail.logs.out }}</code>
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="instanceDetail.template?.rules?.length" class="conn-section">
            <h4>代理规则</h4>
            <ProxyRuleEditor
              :model-value="instanceDetail.template.rules"
              readonly
            />
          </div>

          <div v-if="instanceConnections.length" class="conn-section">
            <h4>进程连接</h4>
            <el-table :data="instanceConnections" size="small">
              <el-table-column prop="pid" label="PID" width="80" />
              <el-table-column prop="name" label="进程名" min-width="120" />
              <el-table-column label="监听端口" min-width="120">
                <template #default="{ row }">
                  <span v-for="(c, i) in row.conns.filter((x: any) => x.status === 'LISTEN')" :key="i">
                    {{ c.laddr?.port ?? '-' }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </div>
    </el-dialog>

    <!-- ============ 实例日志弹窗 ============ -->
    <el-dialog v-model="logDialogVisible" :title="`实例日志：${logInstanceId}`" width="760px">
      <el-tabs v-model="logActiveTab" @tab-change="(name: any) => loadLogs(name)">
        <el-tab-pane label="标准输出 (out)" name="out" />
        <el-tab-pane label="错误输出 (err)" name="err" />
      </el-tabs>
      <div v-loading="logLoading" ref="logViewerRef" class="log-viewer">
        <pre class="log-text">{{ logContent }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.algo-management {
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

.algo-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 32px;
  overflow: hidden;
}

.algo-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.algo-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-toolbar {
  padding-bottom: 16px;
  flex-shrink: 0;
}

/* ---- 算法文件布局 ---- */
.files-layout {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.algo-list {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 12px;
  overflow-y: auto;
}

.algo-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #0d1f3c;
  transition: background 0.2s;
}

.algo-item:hover {
  background: #f0f4fb;
}

.algo-item.active {
  background: #1a6cf0;
  color: #fff;
  font-weight: 600;
}

.algo-item-name {
  word-break: break-all;
}

.algo-tree {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 16px;
  overflow: hidden;
}

/* 文件树独立滚动，不随整个算法信息面板滚动 */
.algo-tree-scroll {
  flex: 1;
  overflow-y: auto;
  margin-top: 4px;
}

.algo-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.algo-meta-id {
  font-size: 16px;
  font-weight: 700;
  color: #0d1f3c;
}

.algo-desc {
  font-size: 13px;
  color: #6a7a90;
  margin: 0 0 12px;
}

.algo-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f7f9fc;
  border-radius: 8px;
}

/* 去掉信息展示区标签的淡入淡出动画 */
.algo-info :deep(.el-tag) {
  transition: none;
  animation: none;
}

.algo-info-row {
  display: flex;
  align-items: flex-start;
}

/* 代理规则展示区 */
.rule-section {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f7f9fc;
  border-radius: 8px;
}

.rule-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.rule-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
}

.rule-section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.algo-info-label {
  font-size: 13px;
  color: #6a7a90;
  flex-shrink: 0;
  line-height: 22px;
  width: 90px;
  text-align: left;
}

.algo-info-value {
  font-size: 13px;
  color: #0d1f3c;
  line-height: 22px;
  word-break: break-all;
}

/* 算法/模板/实例 id 超链接 */
.algo-link {
  font-size: 13px;
  color: #1a6cf0;
  line-height: 22px;
  text-decoration: none;
  word-break: break-all;
}

.algo-link:hover {
  text-decoration: underline;
}

.algo-info-empty {
  font-size: 13px;
  color: #bcc5d0;
  line-height: 22px;
}

.algo-detail-actions {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #eef2f8;
}

.algo-ignores {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tree-file-label {
  font-size: 13px;
}

/* ---- 表格 ---- */
.algo-table {
  flex: 1;
  overflow-y: auto;
}

/* 表格行内操作按钮不换行 */
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.row-actions .el-button + .el-button {
  margin-left: 0;
}

/* 标签列表 */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-empty {
  color: #bcc5d0;
  font-size: 13px;
}

.entry-code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  background: #f0f3f8;
  padding: 2px 6px;
  border-radius: 4px;
}

/* ---- 实例详情 ---- */
.conn-section {
  margin-top: 16px;
}

.conn-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #0d1f3c;
}

/* ---- 实例日志 ---- */
.log-viewer {
  min-height: 200px;
  max-height: 60vh;
  overflow: auto;
  background: #f7f9fc;
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  padding: 12px;
}

.log-text {
  margin: 0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #0d1f3c;
  white-space: pre-wrap;
  word-break: break-all;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}
</style>
