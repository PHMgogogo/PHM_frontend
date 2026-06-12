<script setup lang="ts">
defineProps<{
  activeMenu: string
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:activeMenu', key: string): void
  (e: 'toggle'): void
}>()

const menus = [
  { key: 'aircraft', icon: '✈️', title: '飞行器管理' },
  { key: 'knowledge', icon: '📚', title: '知识库管理' },
  { key: 'config', icon: '🔧', title: '构型管理' },
  { key: 'monitor', icon: '📡', title: '实时监控' },
]
</script>

<template>
  <nav class="side-nav" :class="{ collapsed }">
    <div class="logo-area">
      <span class="logo-icon">🛩️</span>
      <span v-show="!collapsed" class="logo-text">PHM 平台</span>
    </div>
    <ul class="menu-list">
      <li
        v-for="menu in menus"
        :key="menu.key"
        :class="['menu-item', { active: activeMenu === menu.key }]"
        :title="collapsed ? menu.title : ''"
        @click="emit('update:activeMenu', menu.key)"
      >
        <span class="menu-icon">{{ menu.icon }}</span>
        <span v-show="!collapsed" class="menu-title">{{ menu.title }}</span>
      </li>
    </ul>
    <div class="toggle-area" @click="emit('toggle')">
      <el-icon :size="18">
        <component :is="collapsed ? 'Expand' : 'Fold'" />
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
