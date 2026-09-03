<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue'
import type { LocalSessionReference } from '@/utils/local-sessions'

defineProps<{
  modelValue: boolean
  sessions: LocalSessionReference[]
  currentSessionId: string | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: [id: string]
  forget: [id: string]
  new: []
}>()

function shortId(id: string): string {
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="本设备会话"
    size="min(420px, 92vw)"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert
      title="这里只列出本浏览器收到过的会话 ID"
      description="不会请求服务端全局会话列表，也不会在浏览器中保存问题、回答、来源或推理 metadata。"
      type="info"
      :closable="false"
      show-icon
    />
    <el-button class="new-session" type="primary" plain :icon="Plus" @click="emit('new')">
      新对话
    </el-button>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-empty v-if="sessions.length === 0" description="本设备还没有知识库会话" />
    <div v-else v-loading="loading" class="session-list">
      <article
        v-for="session in sessions"
        :key="session.id"
        :class="{ active: session.id === currentSessionId }"
      >
        <button class="session-open" type="button" @click="emit('open', session.id)">
          <strong>{{ shortId(session.id) }}</strong>
          <span>{{ new Date(session.seenAt).toLocaleString('zh-CN') }}</span>
        </button>
        <el-tooltip content="只从本设备列表移除，不删除远端历史">
          <el-button
            text
            circle
            :icon="Delete"
            :aria-label="`从本设备移除 ${session.id}`"
            @click="emit('forget', session.id)"
          />
        </el-tooltip>
      </article>
    </div>
  </el-drawer>
</template>

<style scoped>
.new-session { width: 100%; margin: 14px 0; }
.session-list { display: grid; gap: 9px; }
.session-list article { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; border: 1px solid #e5eaf2; border-radius: 10px; padding: 6px 8px 6px 12px; }
.session-list article.active { border-color: #7caaf8; background: #f3f7ff; }
.session-open { appearance: none; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 6px 0; min-width: 0; }
.session-open strong, .session-open span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-open strong { color: #233653; font-size: 13px; }
.session-open span { color: #8b97aa; font-size: 11px; margin-top: 3px; }
</style>
