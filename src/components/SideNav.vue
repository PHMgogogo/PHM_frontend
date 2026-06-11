<script setup lang="ts">
defineProps<{
  activeMenu: string
}>()

const emit = defineEmits<{
  (e: 'update:activeMenu', key: string): void
}>()

const menus = [
  { key: 'aircraft', icon: '✈️', title: '飞行器管理' },
  { key: 'knowledge', icon: '📚', title: '知识库管理' },
  { key: 'config', icon: '🔧', title: '构型管理' },
  { key: 'monitor', icon: '📡', title: '实时监控' },
]
</script>

<template>
  <nav class="side-nav">
    <div class="logo-area">
      <span class="logo-icon">🛩️</span>
      <span class="logo-text">PHM 平台</span>
    </div>
    <ul class="menu-list">
      <li
        v-for="menu in menus"
        :key="menu.key"
        :class="['menu-item', { active: activeMenu === menu.key }]"
        @click="emit('update:activeMenu', menu.key)"
      >
        <span class="menu-icon">{{ menu.icon }}</span>
        <span class="menu-title">{{ menu.title }}</span>
      </li>
    </ul>
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
</style>
