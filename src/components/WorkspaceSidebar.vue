<script setup lang="ts">
import { ArrowLeft, Fold, Expand } from '@element-plus/icons-vue'
import { aircraftSourceText } from '@/utils/aircraft-source'
import type { Aircraft } from '@/types/entities'

defineProps<{
  aircraft: Aircraft | undefined
  activeMenu: string
  collapsed: boolean
  menus: { key: string; svg: string; title: string }[]
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
      <!-- <span class="ws-aircraft-icon">✈️</span> -->
      <img v-show="!collapsed" src="@/assets/airplane.svg" class="ws-aircraft-icon" alt="Aircraft Icon" />
      <span v-show="!collapsed" class="ws-aircraft-title">{{ aircraft?.aircraftNumber }}</span>
    </div>
    <div v-show="!collapsed" class="ws-aircraft-meta">
      <div v-if="aircraft?.modelCode">{{ aircraft.modelCode }}</div>
      <div v-if="aircraft?.airline">{{ aircraft.airline }}</div>
      <div v-if="aircraft" class="ws-source">来源：{{ aircraftSourceText(aircraft) }}</div>
    </div>
    <ul class="ws-menu-list">
      <li
        v-for="menu in menus"
        :key="menu.key"
        :class="['ws-menu-item', { active: activeMenu === menu.key }]"
        :title="collapsed ? menu.title : ''"
        @click="emit('update:activeMenu', menu.key)"
      >
        <img :src="menu.svg" class="ws-menu-icon" alt="" />
        <span v-show="!collapsed" class="ws-menu-title">{{ menu.title }}</span>
      </li>
    </ul>
    <div class="ws-toggle-area" @click="emit('update:collapsed', !collapsed)">
      <el-icon :size="18">
        <Expand v-if="collapsed" />
        <Fold v-else />
      </el-icon>
    </div>
  </aside>
</template>

<style scoped>
.ws-sidebar {
  width: 232px;
  min-width: 232px;
  max-width: 232px;
  background: var(--phm-surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  color: var(--phm-text-secondary);
  user-select: none;
  border-right: 1px solid var(--phm-border);
  transition:
    width var(--phm-transition),
    min-width var(--phm-transition),
    max-width var(--phm-transition),
    transform var(--phm-transition),
    box-shadow var(--phm-transition);
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
  height: 56px;
  padding: 0 16px;
  font-size: 13px;
  color: var(--phm-text-secondary);
  cursor: pointer;
  border-bottom: 1px solid var(--phm-border);
  transition: color var(--phm-transition), background var(--phm-transition);
}
.ws-back:hover { color: var(--phm-primary-700); background: var(--phm-primary-50); }

.ws-aircraft-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 4px;
}
.ws-aircraft-icon { width: 20px; height: 20px; object-fit: contain; }
.ws-aircraft-title {
  font-size: 16px;
  font-weight: 650;
  color: var(--phm-text);
  word-break: break-all;
}

.ws-aircraft-meta {
  padding: 4px 16px 14px;
  font-size: 12px;
  color: var(--phm-text-muted);
  line-height: 1.6;
  border-bottom: 1px solid var(--phm-border);
  margin-bottom: 8px;
}

.ws-source {
  color: var(--phm-primary);
  margin-top: 2px;
}

.ws-menu-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--phm-radius-control);
  cursor: pointer;
  font-size: 13px;
  transition: background var(--phm-transition), color var(--phm-transition), border-color var(--phm-transition);
}
.ws-menu-item:hover { background: var(--phm-primary-50); color: var(--phm-primary-700); }
.ws-menu-item.active {
  background: var(--phm-primary-50);
  border-color: #cfe5df;
  color: var(--phm-primary-700);
  font-weight: 600;
}
.ws-menu-icon { width: 18px; height: 18px; flex-shrink: 0; object-fit: contain; }
.ws-menu-title { white-space: nowrap; }

/* collapsed overrides */
.ws-sidebar.collapsed .ws-back {
  justify-content: center;
  padding: 0 8px;
  gap: 0;
}

.ws-sidebar.collapsed .ws-aircraft-name {
  justify-content: center;
  padding: 16px 8px;
  gap: 0;
}

.ws-sidebar.collapsed .ws-menu-item {
  justify-content: center;
  padding: 0 8px;
  gap: 0;
}

.ws-toggle-area {
  margin-top: auto;
  padding: 16px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: var(--phm-text-muted);
  border-top: 1px solid var(--phm-border);
  transition: color var(--phm-transition), background var(--phm-transition);
}
.ws-toggle-area:hover { color: var(--phm-primary-700); background: var(--phm-primary-50); }
</style>
