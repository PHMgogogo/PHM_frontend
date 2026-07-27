<script setup lang="ts">
import { ref, computed } from 'vue'
import { Warning, Lock, Unlock, MagicStick, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
// @ts-ignore – JS Vue 组件，运行时正常
import DashboardContainer from '@/components/dashboard/DashboardContainer.vue'
// @ts-ignore – JS Vue 组件，运行时正常
import DataSourcePanel from '@/components/dashboard/DataSourcePanel.vue'
import { queryDisplay, type DisplayRequest, type DisplayResponse } from '@/api/display'
// @ts-ignore – JS 模块，运行时正常
// 补充一点(非本次必须):@ts-ignore 会连带丢掉 buildDisplayOption 的入参/返回类型提示。如果后续你想要保留类型提示,更优解是给 DisplayOptionBuilder.js 配一个 DisplayOptionBuilder.d.ts(声明 buildDisplayOption(displayType: DisplayType, response: DisplayResponse, size?: 'small'|'medium'|'large'): Record<string, unknown>),这样既不用改 tsconfig,也能拿到完整类型。现在先用 @ts-ignore 与现状对齐,等仪表盘配置那块稳定了再统一处理 .d.ts 也不迟。
import { buildDisplayOption } from '@/components/dashboard/DisplayOptionBuilder.js'

// @ts-ignore
const dashboardRef = ref<any>(null)
const isLayoutLocked = ref(false)

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
  controlPanel: { enabled: false },
}

// 查询中状态（用于禁用/提示，由 DataSourcePanel 内部自管 loading，这里仅作画布侧兜底）
const displayLoading = ref(false)

/**
 * 接收 DataSourcePanel 提交的查询参数，调 /api/display 并把结果作为图表注入画布。
 */
async function handleAddChart(payload: {
  data: string
  columns: string[]
  limit: number
  type: DisplayRequest['type']
  size: string
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
    displayLoading.value = false
    return
  } finally {
    displayLoading.value = false
  }

  if (!response || !Array.isArray(response.data) || response.data.length === 0) {
    ElMessage.warning('查询结果为空')
    return
  }

  const option = buildDisplayOption(payload.type, response, payload.size)
  const title =
    (response.parameter && response.parameter.length > 0 && response.parameter.join(' / ')) ||
    '数据图表'

  const added = dashboardRef.value?.addItemWithOption?.(option, title, payload.size)
  if (!added) {
    ElMessage.warning('画布空间不足，无法添加图表')
  }
}
</script>

<template>
  <div class="monitor-page">
    <!-- 页面顶栏 -->
    <div class="monitor-header">
      <div class="header-left">
        <h2 class="page-title">数据展示</h2>
      </div>
      <div class="header-right">
        <div class="status-badges">
          <span class="badge badge-online">● 数据接口就绪</span>
          <span class="badge badge-warn">
            <el-icon color="#F59E0B"><Warning /></el-icon> 侧栏配置数据源
          </span>
        </div>
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
          <el-icon color="#8B5CF6"><MagicStick /></el-icon> 一键优化
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
        <DataSourcePanel @add-chart="handleAddChart" />
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

.status-badges {
  display: flex;
  gap: 10px;
}

.badge {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 20px;
}

.badge-online {
  background: rgba(54, 196, 160, 0.12);
  color: #36c4a0;
}

.badge-warn {
  background: rgba(245, 166, 35, 0.12);
  color: #f5a623;
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
