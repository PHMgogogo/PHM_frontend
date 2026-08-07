<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Lock, Unlock, MagicStick, DArrowLeft, DArrowRight, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/api/client'
// @ts-ignore – JS Vue 组件，运行时正常
import DashboardContainer from '@/components/dashboard/DashboardContainer.vue'
// @ts-ignore – JS Vue 组件，运行时正常
import DataSourcePanel from '@/components/dashboard/DataSourcePanel.vue'
import { queryDisplay, saveDisplay, loadDisplay, type DisplayRequest, type DisplayResponse, type DisplayCanvas } from '@/api/display'
// @ts-ignore – JS 模块，运行时正常
// 补充一点(非本次必须):@ts-ignore 会连带丢掉 buildDisplayOption 的入参/返回类型提示。如果后续你想要保留类型提示,更优解是给 DisplayOptionBuilder.js 配一个 DisplayOptionBuilder.d.ts(声明 buildDisplayOption(displayType: DisplayType, response: DisplayResponse, size?: 'small'|'medium'|'large'): Record<string, unknown>),这样既不用改 tsconfig,也能拿到完整类型。现在先用 @ts-ignore 与现状对齐,等仪表盘配置那块稳定了再统一处理 .d.ts 也不迟。
import { buildDisplayOption, buildTitle } from '@/components/dashboard/DisplayOptionBuilder.js'

// @ts-ignore
const dashboardRef = ref<any>(null)
const isLayoutLocked = ref(false)

// 图表编辑态：当前选中的图表 id 与回填给 DataSourcePanel 的编辑目标（{ id, config } | null）
const selectedId = ref<string | number | null>(null)
const editTarget = ref<{ id: string | number; config: any; currentSize?: { w: number; h: number } } | null>(null)

// 右侧数据源配置侧栏：展开/收起（flex 宽度过渡，不触及 DashboardContainer 内部栅格）
const sidebarCollapsed = ref(false)
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const toggleLock = () => {
  isLayoutLocked.value = !isLayoutLocked.value
}

const optimizeLayout = () => {
  dashboardRef.value?.optimizeLayout()
}

// 纵向溢出（占比超过 100%）时禁用一键优化
const isYOverflow = computed(() => dashboardRef.value?.isYOverflow() ?? false)

// 仪表盘配置（本地构造，不再依赖 mock）
const dashboardConfig = {
  dataSource: [],
  chartTypes: [
    { value: 'SINGLE_TIMESERIES_2D', label: '单参数时序' },
    { value: 'MULTI_TIMESERIES_2D', label: '多参数时序' },
    { value: 'MAPPING_2D', label: '二维映射' },
    { value: 'POINT_CLOUD_3D', label: '三维点云' },
  ],
  sizes: [
    { value: 'small', label: '小', w: 3, h: 10 },
    { value: 'medium', label: '中', w: 6, h: 10 },
    { value: 'large', label: '大', w: 9, h: 10 },
  ],
  layout: { cols: 12, totalRows: 30, margin: [12, 12], containerPadding: [16, 16] },
}

// 查询中状态（用于禁用/提示，由 DataSourcePanel 内部自管 loading，这里仅作画布侧兜底）
const displayLoading = ref(false)

/**
 * 用 payload 构造 DisplayRequest → 查询 → 构建 ECharts option 与标题。
 * 新建 / 更新两条路径共用。失败/空结果时返回 null 并已提示用户。
 */
async function resolveDisplay(payload: {
  data: string
  columns: string[]
  limit: number
  type: DisplayRequest['type']
  size: string
  style: string
  title?: string
}) {
  const req: DisplayRequest = {
    data: payload.data,
    columns: payload.columns,
    limit: payload.limit,
    type: payload.type,
  }
  displayLoading.value = true
  let response: DisplayResponse | null = null
  try {
    response = await queryDisplay(req)
  } catch (e) {
    ElMessage.error('图表数据查询失败: ' + (e instanceof Error ? e.message : String(e)))
    return null
  } finally {
    displayLoading.value = false
  }

  if (!response || !Array.isArray(response.data) || response.data.length === 0) {
    ElMessage.warning('查询结果为空')
    return null
  }

  const option = buildDisplayOption(payload.type, response, payload.size, payload.style)
  // 用户自定义标题优先；留空则按参数名自动命名（buildTitle 兜底返回“数据展示”）
  const title = payload.title?.trim() || buildTitle(response.parameter)
  return { option, title }
}

/**
 * 新建图表：查询 → 注入画布 → 自动进入编辑态（选中新建项，面板保留其配置）。
 */
async function handleAddChart(payload: any) {
  const resolved = await resolveDisplay(payload)
  if (!resolved) return
  const added = dashboardRef.value?.addItemWithOption?.(resolved.option, resolved.title, payload.size, payload)
  if (!added) {
    ElMessage.error('图表添加失败')
    return
  }
  // 自动选中新建图表，便于立即微调
  selectedId.value = added.i
  editTarget.value = { id: added.i, config: payload, currentSize: { w: added.w, h: added.h } }
}

/**
 * 编辑图表：按选中图表的 id 原位更新（不新增、不删除）。
 */
async function handleUpdateChart(payload: any) {
  const id = payload.id
  const resolved = await resolveDisplay(payload)
  if (!resolved) return
  // keepSize 时传 null：DashboardContainer.updateItemOption 守卫 `if (sizeValue && !props.readonly)` 见 null 即跳过 w/h 重置
  const sizeArg = payload.keepSize ? null : payload.size
  const updated = dashboardRef.value?.updateItemOption?.(id, resolved.option, resolved.title, sizeArg, payload)
  if (!updated) {
    // 异步查询期间图表可能已被删除
    ElMessage.warning('目标图表已不存在，请重新选择')
    selectedId.value = null
    editTarget.value = null
    return
  }
  // 刷新 editTarget.config（id 不变 → 不触发面板回填，仅更新内部快照）
  selectedId.value = id
  editTarget.value = { id, config: payload, currentSize: { w: updated.w, h: updated.h } }
}

/** 画布图表点击：item 为 null 表示点击空白处取消选中。 */
function handleChartClicked(item: any) {
  if (!item) {
    selectedId.value = null
    editTarget.value = null
    return
  }
  // 点击已选中的图表：保持选中（v1 不做 toggle）
  if (item.i === selectedId.value) return
  selectedId.value = item.i
  editTarget.value = { id: item.i, config: item.config, currentSize: { w: item.w, h: item.h } }
}

/** 删除事件：若删的是当前选中图表，清空编辑态。 */
function handleItemDeleted(deletedItem: any) {
  if (deletedItem && deletedItem.i === selectedId.value) {
    selectedId.value = null
    editTarget.value = null
  }
}

/** 取消选择 / 回到新建态。 */
function handleCancelEdit() {
  selectedId.value = null
  editTarget.value = null
}

// ── 画布持久化（保存 / 加载） ──
// 画布标识：每个浏览器一份（localStorage 持久），实现「刷新不丢」。
// 如需改为按机型 / 用户隔离，只改这里的取值即可——后端按不透明字符串处理。
const DASHBOARD_KEY_STORAGE = 'phm_display_canvas_key'
function resolveDashboardKey(): string {
  let id = localStorage.getItem(DASHBOARD_KEY_STORAGE)
  if (!id) {
    id = `canvas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DASHBOARD_KEY_STORAGE, id)
  }
  return id
}
const dashboardKey = resolveDashboardKey()

const saving = ref(false)
const loading = ref(false)

/** 保存当前画布到后端（覆盖同 key 快照）。 */
async function handleSaveCanvas() {
  const layout = dashboardRef.value?.getLayout?.()
  if (!layout || layout.length === 0) {
    ElMessage.warning('画布为空，无需保存')
    return
  }
  const canvas: DisplayCanvas = {
    version: 1,
    config: dashboardConfig,
    layout,
  }
  saving.value = true
  try {
    await saveDisplay({
      key: dashboardKey,
      canvas,
      timestamp: new Date().toISOString(),
    })
    ElMessage.success('画布已保存')
  } catch (e) {
    ElMessage.error('画布保存失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    saving.value = false
  }
}

/**
 * 从后端加载已保存画布（快照式还原：直接用 option 渲染，不重新查询）。
 * @param options.silent 静默模式（进页面自动加载用）：跳过覆盖确认，且 404 / 空 / 成功均不弹提示，仅真实异常才提示。
 */
async function handleLoadCanvas({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) {
    // 当前画布非空时先确认，避免覆盖未保存的内容
    const current = dashboardRef.value?.getLayout?.()
    if (current && current.length > 0) {
      if (!window.confirm('加载会覆盖当前画布，未保存的内容将丢失，是否继续？')) return
    }
  }
  loading.value = true
  try {
    const resp = await loadDisplay(dashboardKey)
    const layout = resp?.canvas?.layout
    if (!Array.isArray(layout) || layout.length === 0) {
      if (!silent) ElMessage.warning('已保存画布为空')
      return
    }
    dashboardRef.value?.setLayout?.(layout)
    // 还原后清空编辑态，避免右侧面板停留在已不存在的图表上
    selectedId.value = null
    editTarget.value = null
    if (!silent) ElMessage.success('画布已加载')
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      // 自动加载时 404 属正常（首次访问尚无快照），静默
      if (!silent) ElMessage.info('暂无已保存画布')
    } else {
      ElMessage.error('画布加载失败：' + (e instanceof Error ? e.message : String(e)))
    }
  } finally {
    loading.value = false
  }
}

/** 进入页面自动静默加载已保存画布（若有）。 */
onMounted(() => {
  handleLoadCanvas({ silent: true })
})
</script>

<template>
  <div class="monitor-page">
    <!-- 页面顶栏 -->
    <div class="monitor-header">
      <div class="header-left">
        <h2 class="page-title">数据展示</h2>
      </div>
      <div class="header-right">
        <button class="action-btn" :disabled="saving" @click="handleSaveCanvas">
          <el-icon><Upload /></el-icon> {{ saving ? '保存中…' : '保存' }}
        </button>
        <button class="action-btn" :disabled="loading" @click="handleLoadCanvas()">
          <el-icon><Download /></el-icon> {{ loading ? '加载中…' : '加载' }}
        </button>
        <button class="lock-btn" :class="{ locked: isLayoutLocked }" @click="toggleLock">
          <span>
            <el-icon :color="isLayoutLocked ? '#F59E0B' : '#22C55E'">
              <Lock v-if="isLayoutLocked" />
              <Unlock v-else />
            </el-icon>
            {{ isLayoutLocked ? '布局已锁定' : '可拖拽调整' }}
          </span>
        </button>
        <button class="optimize-btn" :disabled="isLayoutLocked || isYOverflow" @click="optimizeLayout">
          <el-icon><MagicStick /></el-icon> 一键优化
        </button>
      </div>
    </div>

    <!-- 主体：画布 + 右侧可收起侧栏 -->
    <div class="monitor-body">
      <!-- 画布 -->
      <div class="monitor-canvas">
        <DashboardContainer
          ref="dashboardRef"
          :config="dashboardConfig"
          :initial-layout="[]"
          :readonly="isLayoutLocked"
          :show-delete-button="!isLayoutLocked"
          :selected-id="selectedId"
          @chart-clicked="handleChartClicked"
          @item-deleted="handleItemDeleted"
        />
      </div>

      <!-- 侧栏展开/收起按钮：独立浮动，不受侧栏 overflow:hidden 裁剪 -->
      <button
        class="sidebar-toggle"
        :class="{ collapsed: sidebarCollapsed }"
        :title="sidebarCollapsed ? '展开数据源面板' : '收起数据源面板'"
        @click="toggleSidebar"
      >
        <el-icon><DArrowRight v-if="sidebarCollapsed" /><DArrowLeft v-else /></el-icon>
      </button>

      <!-- 右侧数据源配置侧栏 -->
      <div class="monitor-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <DataSourcePanel
          :edit-target="editTarget"
          :size-presets="dashboardConfig.sizes"
          @add-chart="handleAddChart"
          @update-chart="handleUpdateChart"
          @cancel-edit="handleCancelEdit"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* 覆盖仪表盘 CSS 变量以适配 PHM 设计体系 */
  --dashboard-primary-color: #3b7cff;
  --dashboard-primary-color-hover: #5a93ff;
  --dashboard-success-color: #36c4a0;
  --dashboard-warning-color: #f5a623;
  --dashboard-danger-color: #f56c6c;
  --dashboard-info-color: #8c9ab0;
  --dashboard-bg-color: #f4f6fb;
  --dashboard-card-bg: #ffffff;
  --dashboard-border-color: #e4e8f1;
  --dashboard-border-radius: 8px;
  --dashboard-box-shadow: 0 2px 12px rgba(0, 30, 90, 0.06);
  --dashboard-text-color-primary: #0d1f3c;
  --dashboard-text-color-secondary: #8c9ab0;
  --dashboard-font-family: 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
  --dashboard-grid-color: #dde3ef;
  --dashboard-canvas-padding: 16px;
}

/* ── 顶栏 ── */
.monitor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: #ffffff;
  border-bottom: 1px solid #e4e8f1;
  box-shadow: 0 2px 8px rgba(0, 30, 90, 0.04);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.header-subtitle {
  font-size: 12px;
  color: #8c9ab0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.lock-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #e4e8f1;
  border-radius: 8px;
  background: #f4f6fb;
  color: #8c9ab0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.lock-btn:hover {
  border-color: #3b7cff;
  color: #3b7cff;
  background: rgba(59, 124, 255, 0.06);
}

.lock-btn.locked {
  border-color: #3b7cff;
  background: rgba(59, 124, 255, 0.08);
  color: #3b7cff;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #e4e8f1;
  border-radius: 8px;
  background: #f4f6fb;
  color: #8c9ab0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  border-color: #3b7cff;
  color: #3b7cff;
  background: rgba(59, 124, 255, 0.06);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.optimize-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #3b7cff;
  border-radius: 8px;
  background: #3b7cff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.optimize-btn:hover:not(:disabled) {
  background: #5a93ff;
  border-color: #5a93ff;
}

.optimize-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 主体区：画布 + 侧栏 ── */
.monitor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.monitor-canvas {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* 侧栏展开/收起按钮：绝对定位贴在画布与侧栏分界处，
   独立于侧栏 DOM，侧栏收起为 0 宽时按钮依然可见可点。 */
.sidebar-toggle {
  position: absolute;
  top: 50%;
  right: 340px; /* 展开态：贴在侧栏左边缘 */
  transform: translate(50%, -50%);
  width: 30px;
  height: 64px;
  border: 2px solid #0d1f3c;
  background: #ffffff;
  border-radius: 8px;
  color: #0d1f3c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  box-shadow: 0 3px 12px rgba(0, 30, 90, 0.18);
  transition: right 0.25s ease, color 0.2s, border-color 0.2s, background 0.2s, transform 0.25s ease;
}

.sidebar-toggle :deep(.el-icon) {
  font-size: 18px;
}

.sidebar-toggle:hover {
  color: #ffffff;
  border-color: #3b7cff;
  background: #3b7cff;
}

.sidebar-toggle:active {
  transform: translate(50%, -50%) scale(0.95);
}

/* 收起态：按钮贴到画布最右侧 */
.sidebar-toggle.collapsed {
  right: 12px;
}

.monitor-sidebar {
  flex-shrink: 0;
  width: 340px;
  overflow: hidden;
  transition: width 0.25s ease;
}

.monitor-sidebar.collapsed {
  width: 0;
}
</style>
