<script setup lang="ts">
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { _ } from '../i18n'
import { ElMessageBox } from 'element-plus'

defineProps<{
  pipelines: string[]
  activeId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
  rename: [oldId: string]
  delete: [id: string]
}>()

async function confirmDelete(id: string) {
  try {
    await ElMessageBox.confirm(
      _('Are you sure to delete pipeline') + ` "${id}"?`,
      _('Delete Pipeline'),
      {
        confirmButtonText: _('OK'),
        cancelButtonText: _('Cancel'),
        type: 'warning',
      }
    )
    emit('delete', id)
  } catch { /* cancel */ }
}
</script>

<template>
  <div class="navigator">
    <div class="nav-header">
      <h4 class="nav-title">{{ _('Pipelines') }}</h4>
      <el-button type="primary" size="small" circle @click="emit('create')">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>
    <el-menu
      :default-active="activeId"
      @select="(id: string) => emit('select', id)"
    >
      <el-menu-item
        v-for="id in pipelines"
        :key="id"
        :index="id"
      >
        <div class="menu-item-content">
          <span class="menu-item-text">{{ id }}</span>
          <el-icon class="rename-icon" @click.stop="emit('rename', id)"><Edit /></el-icon>
          <el-icon class="delete-icon" @click.stop="confirmDelete(id)"><Delete /></el-icon>
        </div>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<style scoped>
.navigator {
  height: 100%;
  overflow-y: auto;
}

.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  border-bottom: 1px solid #ebeef5;
}

.nav-title {
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
  margin: 0;
}

.el-menu {
  border-right: none;
}

.navigator :deep(.el-menu-item) {
  border-radius: 6px;
  margin: 2px 6px;
  padding: 0 8px;
  height: 40px;
  line-height: 40px;
}

.navigator :deep(.el-menu-item.is-active) {
  background: rgba(26, 108, 240, 0.08);
  color: #1a6cf0;
  font-weight: 600;
}

.navigator :deep(.el-menu-item:hover) {
  background: rgba(26, 108, 240, 0.06);
}

.menu-item-content {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.menu-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 0;
  transition: padding-right 0.2s;
}

/* 按钮默认不占空间，仅在 hover 时靠右浮现 */
.rename-icon,
.delete-icon {
  position: absolute;
  right: 0;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
}

.rename-icon {
  right: 24px;
}

.delete-icon {
  color: #f56c6c;
}

.el-menu-item:hover .rename-icon,
.el-menu-item:hover .delete-icon {
  opacity: 1;
}

.el-menu-item:hover .menu-item-text {
  padding-right: 48px;
}
</style>
