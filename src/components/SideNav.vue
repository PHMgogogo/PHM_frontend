<script setup lang="ts">
import { Fold } from '@element-plus/icons-vue'
import airplaneIcon from '@/assets/airplane.svg'
import modelIcon from '@/assets/model.svg'
import knowledgeIcon from '@/assets/knowledgebase.svg'
import configIcon from '@/assets/config.svg'
import monitorIcon from '@/assets/monitor.svg'
import algorithmIcon from '@/assets/algorithm.svg'
import dataIcon from '@/assets/data.svg'

defineProps<{
  activeMenu: string
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:activeMenu', key: string): void
  (e: 'toggle'): void
}>()

type MenuItem = {
  key: string
  title: string
  icon?: string // emoji
  svg?: string // imported SVG url / data-uri
}

const menus: MenuItem[] = [
  { key: 'aircraft', svg: airplaneIcon, title: '飞行器管理' },
  { key: 'model', svg: modelIcon, title: '机型管理' },
  { key: 'knowledge', svg: knowledgeIcon, title: '知识库管理' },
  { key: 'config', svg: configIcon, title: '构型管理' },
  { key: 'monitor', svg: monitorIcon, title: '数据展示' },
  { key: 'algo', svg: algorithmIcon, title: '算法管理' },
  { key: 'interface', svg: dataIcon, title: '接口管理' },
  { key: 'external', icon: '🌐', title: '外来平台配置' },
]
</script>

<template>
  <nav class="side-nav" :class="{ collapsed }">
    <div class="logo-area">
      <!-- <span class="logo-icon">🛩️</span> -->
      <img src="@/assets/logo.svg" class="logo-icon" alt="PHM Logo" />
      <span v-show="!collapsed" class="logo-text">eOIPHM</span>
      <button
        v-show="!collapsed"
        type="button"
        class="mobile-nav-close"
        aria-label="收起导航"
        @click="emit('toggle')"
      >
        <el-icon><Fold /></el-icon>
      </button>
    </div>
    <ul class="menu-list">
      <li
        v-for="menu in menus"
        :key="menu.key"
        :class="['menu-item', { active: activeMenu === menu.key }]"
        :title="collapsed ? menu.title : ''"
        @click="emit('update:activeMenu', menu.key)"
      >
        <span class="menu-icon">
          <img v-if="menu.svg" :src="menu.svg" class="menu-icon-svg" alt="" />
          <template v-else>{{ menu.icon ?? '' }}</template>
        </span>
        <span v-show="!collapsed" class="menu-title">{{ menu.title }}</span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.side-nav {
  width: 100%;
  height: 100%;
  background: var(--phm-surface);
  display: flex;
  flex-direction: column;
  color: var(--phm-text-secondary);
  user-select: none;
  border-right: 1px solid var(--phm-border);
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  flex: 0 0 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--phm-border);
}

.logo-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-text {
  color: var(--phm-text);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 0;
  white-space: nowrap;
}

.mobile-nav-close {
  display: none;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: 1px solid var(--phm-border);
  border-radius: var(--phm-radius-control);
  background: var(--phm-surface);
  color: var(--phm-text-secondary);
  cursor: pointer;
}

.mobile-nav-close:hover {
  border-color: #cfe5df;
  background: var(--phm-primary-50);
  color: var(--phm-primary-700);
}

.menu-list {
  list-style: none;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--phm-radius-control);
  cursor: pointer;
  transition: background var(--phm-transition), color var(--phm-transition), border-color var(--phm-transition);
  font-size: 13px;
}

.menu-item:hover {
  background: var(--phm-primary-50);
  color: var(--phm-primary-700);
}

.menu-item.active {
  background: var(--phm-primary-50);
  border-color: #cfe5df;
  color: var(--phm-primary-700);
  font-weight: 600;
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--phm-primary);
}

.menu-icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  font-size: 17px;
  flex-shrink: 0;
}

.menu-icon-svg {
  width: 18px;
  height: 18px;
  display: block;
}

.menu-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- collapsed overrides ---- */
.side-nav.collapsed .logo-area {
  justify-content: center;
  padding: 0 8px;
  gap: 0;
}

.side-nav.collapsed .menu-list {
  padding: 8px 6px;
}

.side-nav.collapsed .menu-item {
  justify-content: center;
  padding: 0 8px;
  gap: 0;
}

.side-nav.collapsed .menu-item.active::before {
  left: -1px;
}

@media (max-width: 760px) {
  .mobile-nav-close {
    display: grid;
  }
}
</style>
