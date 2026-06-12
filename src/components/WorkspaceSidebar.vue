<script setup lang="ts">
import { ArrowLeft, Fold, Expand } from '@element-plus/icons-vue'
import type { Aircraft } from '@/types/entities'

defineProps<{
  aircraft: Aircraft | undefined
  activeMenu: string
  collapsed: boolean
  menus: { key: string; icon: string; title: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:activeMenu', val: string): void
  (e: 'update:collapsed', val: boolean): void
  (e: 'navigate-home'): void
}>()
</script>

<template>
  <aside class="ws-sidebar" :class="{ collapsed }">
    <div class="ws-back" :title="collapsed ? '返回首页' : ''" @click="emit('navigate-home')">
      <el-icon><ArrowLeft /></el-icon>
      <span v-show="!collapsed">返回首页</span>
    </div>
    <div class="ws-aircraft-name">
      <span class="ws-aircraft-icon">✈️</span>
      <span v-show="!collapsed" class="ws-aircraft-title">{{ aircraft?.aircraftNumber }}</span>
    </div>
    <div v-show="!collapsed" class="ws-aircraft-meta">
      <div>{{ aircraft?.modelCode }}</div>
      <div v-if="aircraft?.airline">{{ aircraft.airline }}</div>
    </div>
    <ul class="ws-menu-list">
      <li
        v-for="menu in menus"
        :key="menu.key"
        :class="['ws-menu-item', { active: activeMenu === menu.key }]"
        :title="collapsed ? menu.title : ''"
        @click="emit('update:activeMenu', menu.key)"
      >
        <span class="ws-menu-icon">{{ menu.icon }}</span>
        <span v-show="!collapsed" class="ws-menu-title">{{ menu.title }}</span>
      </li>
    </ul>
    <div class="ws-toggle-area" @click="emit('update:collapsed', !collapsed)">
      <el-icon :size="18">
        <component :is="collapsed ? 'Expand' : 'Fold'" />
      </el-icon>
    </div>
  </aside>
</template>

<style scoped>
.ws-sidebar {
  width: 15%;
  min-width: 160px;
  max-width: 240px;
  background: #0d1f3c;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  color: #c8d8f0;
  user-select: none;
  transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease;
  overflow: hidden;
}

.ws-sidebar.collapsed {
  width: 64px;
  min-width: 64px;
  max-width: 64px;
}

.ws-back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 14px;
  font-size: 13px;
  color: #8cafd4;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: color 0.2s;
}
.ws-back:hover { color: #fff; }

.ws-aircraft-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 4px;
}
.ws-aircraft-icon { font-size: 20px; }
.ws-aircraft-title {
  font-size: 15px;
  font-weight: 700;
  color: #e8f0fc;
  word-break: break-all;
}

.ws-aircraft-meta {
  padding: 4px 20px 14px;
  font-size: 12px;
  color: #6888aa;
  line-height: 1.6;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 10px;
}

.ws-menu-list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s, color 0.2s;
}
.ws-menu-item:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.ws-menu-item.active { background: #1a6cf0; color: #fff; font-weight: 600; }
.ws-menu-icon { font-size: 16px; flex-shrink: 0; }
.ws-menu-title { white-space: nowrap; }

/* collapsed overrides */
.ws-sidebar.collapsed .ws-back {
  justify-content: center;
  padding: 18px 8px 14px;
  gap: 0;
}

.ws-sidebar.collapsed .ws-aircraft-name {
  justify-content: center;
  padding: 12px 8px 16px;
  gap: 0;
}

.ws-sidebar.collapsed .ws-menu-item {
  justify-content: center;
  padding: 11px 8px;
  gap: 0;
}

.ws-toggle-area {
  margin-top: auto;
  padding: 16px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: #6888aa;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: color 0.2s;
}
.ws-toggle-area:hover { color: #fff; }
</style>
