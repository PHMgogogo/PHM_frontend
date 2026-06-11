<script setup lang="ts">
import { ref } from 'vue'
// @ts-ignore – JS Vue 组件，运行时正常
import DashboardContainer from '@/components/dashboard/DashboardContainer.vue'
import { monitorInitialLayout, monitorDashboardConfig } from '@/mock/aircraft-monitor'

// @ts-ignore
const dashboardRef = ref<any>(null)
const isLayoutLocked = ref(false)

const toggleLock = () => {
  isLayoutLocked.value = !isLayoutLocked.value
}

const optimizeLayout = () => {
  dashboardRef.value?.optimizeLayout()
}
</script>

<template>
  <div class="monitor-page">
    <!-- 页面顶栏 -->
    <div class="monitor-header">
      <div class="header-left">
        <h2 class="page-title">实时监控</h2>
        <span class="header-subtitle">飞行器状态总览 · 数据更新：2026-05-18 18:00</span>
      </div>
      <div class="header-right">
        <div class="status-badges">
          <span class="badge badge-online">● 在线 5 架</span>
          <span class="badge badge-warn">⚠ 预警 2 项</span>
        </div>
        <button class="lock-btn" :class="{ locked: isLayoutLocked }" @click="toggleLock">
          <span>{{ isLayoutLocked ? '🔒 布局已锁定' : '🔓 可拖拽调整' }}</span>
        </button>
        <button class="optimize-btn" :disabled="isLayoutLocked" @click="optimizeLayout">
          ✦ 一键优化
        </button>
      </div>
    </div>

    <!-- 仪表盘画布 -->
    <div class="monitor-canvas">
      <DashboardContainer
        ref="dashboardRef"
        :config="monitorDashboardConfig"
        :initial-layout="monitorInitialLayout"
        :readonly="isLayoutLocked"
        :show-delete-button="false"
      />
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

/* ── 画布区 ── */
.monitor-canvas {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>
