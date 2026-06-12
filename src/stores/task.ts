import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/task'
import { instanceApi } from '@/api/instance'
import { opencodeApi } from '@/lib/opencode-api'
import { useChatStore } from '@/stores/chat'
import type { Task } from '@/types/entities'

// ---- 工具函数 ----

/** 将 Linux 路径转为 Windows UNC 路径 */
function convertPath(filePath: string): string {
  return filePath.replace(/^\/mnt\/d/, '\\\\192.168.31.13').replace(/\//g, '\\')
}

/** 友好错误信息 */
function friendlyError(e: unknown): string {
  if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
    return '服务不可达，请确认后端服务已启动'
  }
  return (e as Error).message || '未知错误'
}

// ---- Cookie 工具（session cookie，关浏览器后清除） ----

const COOKIE_CURRENT_TASK = 'phm_current_task'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`
}

export const useTaskStore = defineStore('task', () => {
  // ---- 状态 ----
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const createStep = ref('')

  /** 每个飞行器当前正在对话的任务 ID（session cookie 持久化，关浏览器后清除） */
  const currentTaskByAircraft = ref<Record<string, number>>({})

  // ---- Cookie 同步 ----

  function syncCurrentTaskCookie() {
    const json = JSON.stringify(currentTaskByAircraft.value)
    if (json === '{}') {
      deleteCookie(COOKIE_CURRENT_TASK)
    } else {
      setCookie(COOKIE_CURRENT_TASK, json)
    }
  }

  /** 从 cookie 恢复状态 */
  function loadFromCookies() {
    try {
      const taskJson = getCookie(COOKIE_CURRENT_TASK)
      if (taskJson) {
        currentTaskByAircraft.value = JSON.parse(taskJson)
      }
    } catch {
      // Cookie 数据损坏，忽略
    }
  }

  // ---- currentTask 追踪 ----

  /** 获取指定飞行器当前正在对话的任务 */
  function getCurrentTask(aircraftNumber: string): Task | undefined {
    const taskId = currentTaskByAircraft.value[aircraftNumber]
    if (!taskId) return undefined
    return tasks.value.find((t) => t.id === taskId)
  }

  function setCurrentTask(aircraftNumber: string, taskId: number) {
    currentTaskByAircraft.value = { ...currentTaskByAircraft.value, [aircraftNumber]: taskId }
    syncCurrentTaskCookie()
  }

  function clearCurrentTask(aircraftNumber: string) {
    const next = { ...currentTaskByAircraft.value }
    delete next[aircraftNumber]
    currentTaskByAircraft.value = next
    syncCurrentTaskCookie()
  }

  // ---- 任务列表 ----

  async function fetchTasks() {
    loading.value = true
    try {
      const res = await taskApi.list()
      tasks.value = res.map((r) => ({
        id: r.task_id,
        name: r.name,
        description: r.description,
        sessionId: r.session_id,
        instanceId: r.instance_id || '',
        workDir: r.work_dir || '',
        createdAt: '',
        updatedAt: '',
      }))
    } catch (e) {
      ElMessage.error('加载任务列表失败: ' + friendlyError(e))
    } finally {
      loading.value = false
    }
  }

  // ---- 创建任务（多步编排） ----

  async function createTask(data: { name: string; description: string }): Promise<Task | null> {
    creating.value = true
    let instanceId = ''
    let sessionId = ''

    try {
      // Step 1: 启动算法实例
      createStep.value = '正在启动算法实例...'
      const inst = await instanceApi.start()
      instanceId = inst.instance_id

      // Step 2: 处理工作目录路径
      createStep.value = '正在连接工作区...'
      const workDir = convertPath(inst.file_path)
      const opts = {
        base: '/opencode',
        dir: workDir,
        user: 'opencode',
      }

      // Step 3: 创建 OpenCode 会话
      createStep.value = '正在创建会话...'
      const session = await opencodeApi.create(opts, data.name)
      sessionId = session.id

      // Step 4: 保存任务到本地后端
      createStep.value = '正在保存任务...'
      await taskApi.create({
        name: data.name,
        description: data.description || '',
        session_id: sessionId,
        instance_id: instanceId,
        work_dir: workDir,
      })

      // Step 5: 刷新列表
      await fetchTasks()
      ElMessage.success('任务创建成功')

      return tasks.value.find((t) => t.sessionId === sessionId) ?? null
    } catch (e) {
      ElMessage.error(`任务创建失败 (${createStep.value}): ${friendlyError(e)}`)
      return null
    } finally {
      creating.value = false
      createStep.value = ''
    }
  }

  // ---- 删除任务（串联：断开连接 → 删会话 → 删实例 → 删任务） ----

  async function deleteTask(taskId: number) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) {
      ElMessage.error('任务不存在')
      return
    }

    // Step 1: 断开与该任务关联的 OpenCode 连接
    const chatStore = useChatStore()
    if (chatStore.currentSid === task.sessionId) {
      chatStore.dispose()
      // 重置连接相关状态
      chatStore.$patch({
        connected: false,
        currentSid: '',
        sessionBusy: false,
        errorMsg: '',
      })
    }

    // Step 2: 删除 OpenCode 会话（尽力而为，失败不阻塞）
    if (task.sessionId) {
      try {
        await opencodeApi.deleteSession(
          { base: '/opencode', dir: task.workDir, user: 'opencode' },
          task.sessionId,
        )
      } catch (e) {
        console.warn('删除 OpenCode 会话失败（可能已不存在）:', (e as Error).message)
        // 继续执行后续步骤
      }
    }

    // Step 3: 删除算法实例（尽力而为，失败不阻塞）
    if (task.instanceId) {
      try {
        await instanceApi.remove(task.instanceId)
      } catch (e) {
        console.warn('删除算法实例失败（可能已不存在）:', (e as Error).message)
        // 继续执行后续步骤
      }
    }

    // Step 4: 删除后端任务记录（必须成功）
    try {
      await taskApi.remove(taskId)
    } catch (e) {
      ElMessage.error('删除任务失败: ' + friendlyError(e))
      return
    }

    // Step 5: 更新本地状态
    tasks.value = tasks.value.filter((t) => t.id !== taskId)

    // 从所有飞行器的 currentTask 中移除
    const nextCurrent = { ...currentTaskByAircraft.value }
    for (const key of Object.keys(nextCurrent)) {
      if (nextCurrent[key] === taskId) {
        delete nextCurrent[key]
      }
    }
    currentTaskByAircraft.value = nextCurrent
    syncCurrentTaskCookie()

    ElMessage.success('任务已删除')
  }

  // ---- 初始化入口 ----

  function init() {
    loadFromCookies()
    fetchTasks()
  }

  return {
    tasks,
    loading,
    creating,
    createStep,
    currentTaskByAircraft,
    getCurrentTask,
    setCurrentTask,
    clearCurrentTask,
    fetchTasks,
    createTask,
    deleteTask,
    init,
  }
})
