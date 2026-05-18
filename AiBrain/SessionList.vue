<template>
  <el-card class="card-dark session-card">
    <template #header>
      <span class="section-header">会话管理</span>
    </template>

    <div class="new-session">
      <el-input
        :model-value="newSessionTitle"
        placeholder="新会话名称"
        size="small"
        :disabled="!connected"
        @update:model-value="$emit('update:newSessionTitle', $event)"
        @keydown.enter="$emit('create')"
      />
      <el-button
        type="primary"
        size="small"
        :disabled="!connected"
        :loading="creating"
        @click="$emit('create')"
      >
        创建
      </el-button>
    </div>

    <div class="session-list">
      <div
        v-for="item in sessions"
        :key="item.id"
        class="session-row"
        :class="{ active: item.id === currentSid }"
        @click="$emit('open', item.id)"
      >
        <div class="session-row-main">
          <span class="session-title">{{ item.title || '(无标题)' }}</span>
          <el-button
            link
            size="small"
            class="delete-btn"
            @click.stop="$emit('delete', item)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <span class="session-id">{{ item.id.slice(0, 8) }}…</span>
      </div>
      <div v-if="!sessions.length" class="empty-hint">暂无会话</div>
    </div>
  </el-card>
</template>

<script setup>
import { Delete } from '@element-plus/icons-vue'

defineProps({
  sessions: { type: Array, default: () => [] },
  currentSid: { type: String, default: '' },
  newSessionTitle: { type: String, default: '' },
  connected: { type: Boolean, default: false },
  creating: { type: Boolean, default: false },
})

defineEmits(['update:newSessionTitle', 'open', 'create', 'delete'])
</script>

<style scoped>
/* 覆盖 card-dark 的全局 padding；让卡片在 flex 左侧面板中占满剩余高度 */
.session-card {
  padding: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.el-card__body) {
  padding: 10px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.new-session { display: flex; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }

.session-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.session-row {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.session-row:hover { background: #112240; border-color: #1a3a5c; }
.session-row:hover .delete-btn { opacity: 1; }
.session-row.active { background: #0d2a4a; border-color: #40a9ff; }

.session-row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.session-title {
  font-size: 13px;
  color: #c8ddf0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.15s;
  color: #ff4d4f !important;
  flex-shrink: 0;
}

.session-id { font-size: 11px; color: #4a6a80; font-family: monospace; }

.empty-hint { color: #4a6a80; font-size: 13px; padding: 8px 0; }
</style>
