<script setup lang="ts">
import { Fold, Expand } from '@element-plus/icons-vue'
import airplaneIcon from '@/assets/airplane.svg'
import sortieIcon from '@/assets/sortie.svg'
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
  { key: 'sortie', svg: sortieIcon, title: '架次查询' },
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
    <div class="toggle-area" @click="emit('toggle')">
      <el-icon :size="18">
        <Expand v-if="collapsed" />
        <Fold v-else />
      </el-icon>
    </div>
  </nav>
</template>

<style scoped>
.side-nav {
  width: 100%;
  height: 100%;
  background: #0d1f3c;
  display: flex;
  flex-direction: column;
  color: #c8d8f0;
  user-select: none;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 28px 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}

.logo-icon {
  font-size: 22px;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #e8f0fc;
  letter-spacing: 1px;
}

.menu-list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-size: 14px;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.menu-item.active {
  background: #1a6cf0;
  color: #ffffff;
  font-weight: 600;
}

.menu-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.menu-icon-svg {
  width: 18px;
  height: 18px;
  display: block;
}

.menu-title {
  white-space: nowrap;
}

/* ---- collapsed overrides ---- */
.side-nav.collapsed .logo-area {
  justify-content: center;
  padding: 20px 8px 16px;
  gap: 0;
}

.side-nav.collapsed .menu-item {
  justify-content: center;
  padding: 12px 8px;
  gap: 0;
}

/* ---- bottom toggle ---- */
.toggle-area {
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
.toggle-area:hover {
  color: #ffffff;
}
</style>
