<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useChatStore } from '@/stores/chat'
import TaskDialog from '@/components/TaskDialog.vue'
import type { Task } from '@/types/entities'

const props = defineProps<{
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'enter-chat', task: Task): void
}>()

const taskStore = useTaskStore()
const chatStore = useChatStore()

const searchKeyword = ref('')
const showTaskDialog = ref(false)

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

const filteredTasks = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const list = taskStore.tasks
  if (!kw) return list
  return list.filter((t) => t.name.toLowerCase().includes(kw))
})

function handleCreateTaskClick() {
  showTaskDialog.value = true
}

async function onTaskConfirm(data: { name: string; description: string }) {
  const result = await taskStore.createTask(data)
  if (result) showTaskDialog.value = false
}

function handleDeleteTask(task: Task) {
  ElMessageBox.confirm(
    `确认删除任务「${task.name}」？删除后将同时清理关联的会话与算法实例，此操作不可恢复。`,
    '删除任务',
    { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(() => {
      taskStore.deleteTask(task.id)
    })
    .catch(() => {
      // 用户取消
    })
}

function handleEditTask(task: Task) {
  const workDir = task.workDir
  if (!workDir) {
    ElMessage.warning('工作目录信息不可用。请重新创建任务。')
    return
  }
  taskStore.setCurrentTask(props.aircraftNumber, task.id)
  chatStore.connectToSession(task.sessionId, workDir)
  emit('enter-chat', task)
}

function handleConfigTask(_task: Task) {
  // TODO: 配置功能（后续迭代）
  ElMessage.info('配置功能开发中')
}
</script>

<template>
  <div class="page-inner">
    <div class="page-header">
      <h2 class="page-title">任务管理</h2>
    </div>

    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索任务名称..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button
        type="primary"
        class="add-btn"
        @click="handleCreateTaskClick"
      >
        + 创建任务
      </el-button>
    </div>

    <!-- 任务列表 -->
    <div class="task-list" v-loading="taskStore.loading">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-item"
      >
        <div class="task-info">
          <div class="task-name">{{ truncate(task.name, 20) }}</div>
          <div class="task-desc">{{ task.description || '暂无描述' }}</div>
        </div>
        <div class="task-actions">
          <el-button type="primary" size="small" @click="handleEditTask(task)">
            编辑
          </el-button>
          <el-button type="primary" plain size="small" @click="handleConfigTask(task)">
            配置
          </el-button>
          <el-button type="danger" size="small" @click="handleDeleteTask(task)">
            删除
          </el-button>
        </div>
      </div>

      <div
        v-if="filteredTasks.length === 0 && !taskStore.loading"
        class="inner-empty"
      >
        暂无任务，点击"创建任务"开始
      </div>
    </div>
  </div>

  <!-- 任务创建弹窗 -->
  <TaskDialog
    v-model:visible="showTaskDialog"
    :loading="taskStore.creating"
    @confirm="onTaskConfirm"
  />

  <!-- 创建进度 -->
  <div v-if="taskStore.creating" class="create-progress">
    {{ taskStore.createStep }}
  </div>
</template>

<style scoped>
.page-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 32px;
  gap: 16px;
  overflow-y: auto;
}

.page-header {
  padding: 0 0 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 0;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.add-btn {
  white-space: nowrap;
  font-weight: 600;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 0 24px;
  height: 10vh;
  min-height: 72px;
  flex-shrink: 0;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.task-item:hover {
  border-color: #d4e3fb;
  box-shadow: 0 2px 8px rgba(26, 108, 240, 0.06);
}

.task-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.task-name {
  font-size: 16px;
  font-weight: 700;
  color: #0d1f3c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.task-desc {
  font-size: 13px;
  color: #8c9ab0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 24px;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}

.create-progress {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a6cf0;
  color: #fff;
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(26, 108, 240, 0.3);
  z-index: 3000;
}
</style>
