import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/task'
import { instanceApi } from '@/api/instance'
import { clearWorkerClient } from '@/api/instance-worker'
import { opencodeApi } from '@/lib/opencode-api'
import { useChatStore } from '@/stores/chat'
import type { Task } from '@/types/entities'

// ---- 工具函数 ----

/** 将 Linux 路径转为 Windows UNC 路径 */
function convertPath(filePath: string): string {
  return filePath;
  // return filePath.replace(/^\/mnt\/d/, '\\\\192.168.31.13').replace(/\//g, '\\')
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
  const updating = ref(false)
  const clearing = ref(false)

  /** 每个飞行器当前正在对话的任务 ID（session cookie 持久化，关浏览器后清除） */
  const currentTaskByAircraft = ref<Record<string, number>>({})

  /** 当前工作区所属飞机标识（即后端 aircraft_id），由 init() 设置，供 loadTasks/createTask 复用 */
  const currentAircraftId = ref('')

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

  /**
   * 加载并映射当前飞机的任务列表（不切换 loading，供 init/createTask 等在外壳内复用）。
   * 返回 initialization_required：该飞机是否仍需初始化（无任何专属任务时为 true）。
   */
  async function loadTasks(): Promise<boolean> {
    const res = await taskApi.listByAircraft(currentAircraftId.value)
    tasks.value = res.tasks.map((r) => ({
      id: r.task_id,
      name: r.name,
      description: r.description,
      sessionId: r.session_id,
      instanceId: r.instance_id || '',
      workDir: r.work_dir || '',
      aircraftId: r.aircraft_id || '',
      isGlobal: r.is_global ?? false,
      isDefault: r.default ?? false,
      createdAt: '',
      updatedAt: '',
    }))
    return res.initialization_required
  }

  /** 重新拉取当前飞机的任务列表（带 loading 态，供需要 loading 指示的路径调用） */
  async function fetchTasks() {
    loading.value = true
    try {
      await loadTasks()
    } catch (e) {
      ElMessage.error('加载会话列表失败: ' + friendlyError(e))
    } finally {
      loading.value = false
    }
  }

  // ---- 创建任务（多步编排） ----

  async function createTask(
    data: { name: string; description: string },
    opts?: { isDefault?: boolean; isGlobal?: boolean },
  ): Promise<Task | null> {
    creating.value = true
    let instanceId = ''
    let sessionId = ''

    try {
      // Step 1: 启动实例
      createStep.value = '正在启动实例...'
      const inst = await instanceApi.start()
      instanceId = inst.instance_id

      // Step 2: 处理工作目录路径
      createStep.value = '正在连接工作区...'
      const workDir = convertPath(inst.file_path)
      const sessionOpts = {
        base: '/opencode',
        dir: workDir,
        user: 'opencode',
      }

      // Step 3: 创建 OpenCode 会话
      createStep.value = '正在创建会话...'
      const session = await opencodeApi.create(sessionOpts, data.name)
      sessionId = session.id

      // Step 4: 保存任务到本地后端（携带当前飞机标识与默认/全局标记）
      createStep.value = '正在保存会话...'
      await taskApi.create({
        name: data.name,
        description: data.description || '',
        session_id: sessionId,
        instance_id: instanceId,
        work_dir: workDir,
        aircraft_id: currentAircraftId.value,
        default: opts?.isDefault ?? false,
        is_global: opts?.isGlobal ?? false,
      })

      // Step 5: 刷新列表（不切换 loading，避免在外壳内反复 toggle）
      await loadTasks()
      ElMessage.success('会话创建成功')

      return tasks.value.find((t) => t.sessionId === sessionId) ?? null
    } catch (e) {
      ElMessage.error(`会话创建失败 (${createStep.value}): ${friendlyError(e)}`)
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
      ElMessage.error('会话不存在')
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

    // Step 3: 删除实例（尽力而为，失败不阻塞）
    if (task.instanceId) {
      try {
        await instanceApi.remove(task.instanceId)
      } catch (e) {
        console.warn('删除实例失败（可能已不存在）:', (e as Error).message)
        // 继续执行后续步骤
      }
      // 无论远程删除是否成功，清理本地 client 缓存
      clearWorkerClient(task.instanceId)
    }

    // Step 4: 删除后端任务记录（必须成功）
    try {
      await taskApi.remove(taskId)
    } catch (e) {
      ElMessage.error('删除会话失败: ' + friendlyError(e))
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

    ElMessage.success('会话已删除')
  }

  // ---- 更新任务信息 ----

  async function updateTask(
    taskId: number,
    data: { name: string; description: string; isGlobal?: boolean },
  ) {
    updating.value = true
    try {
      await taskApi.update(taskId, {
        name: data.name,
        description: data.description,
        is_global: data.isGlobal,
      })
      await loadTasks()
      ElMessage.success('会话信息已保存')
    } catch (e) {
      ElMessage.error('保存失败: ' + friendlyError(e))
    } finally {
      updating.value = false
    }
  }

  // ---- 清空对话（/clear：换新 session 重置 AI 上下文） ----

  /**
   * 真正的 /clear：创建全新 OpenCode session → 同步 task 记录的 session_id →
   * 切换 chat 连接 → 删除旧 session。这样 AI 上下文被彻底重置，
   * 且重开任务不会连回带历史的旧 session。
   */
  async function clearTaskSession(taskId: number): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) {
      ElMessage.error('会话不存在')
      return false
    }

    const chatStore = useChatStore()
    if (chatStore.sessionBusy) {
      ElMessage.warning('对话进行中，请先中止后再清空')
      return false
    }

    const oldSid = task.sessionId
    const workDir = task.workDir
    const sessionOpts = { base: '/opencode', dir: workDir, user: 'opencode' }

    clearing.value = true
    try {
      // Step 1: 创建新 session（全新上下文）
      const session = await opencodeApi.create(sessionOpts, task.name)

      // Step 2: 同步 task 记录的 session_id（必须成功，否则重开任务会连回旧 session）
      try {
        await taskApi.updateSessionId(taskId, session.id)
      } catch (e) {
        // 回滚：删除刚创建的孤立新 session，保持原绑定不变
        try {
          await opencodeApi.deleteSession(sessionOpts, session.id)
        } catch {
          /* 忽略清理失败 */
        }
        throw e
      }

      // Step 3: 切换 chat 连接到新 session（内部 dispose 旧 SSE + 拉取空消息）
      await chatStore.connectToSession(session.id, workDir)

      // Step 4: 删除旧 session（best-effort，失败不阻塞）
      if (oldSid && oldSid !== session.id) {
        try {
          await opencodeApi.deleteSession(sessionOpts, oldSid)
        } catch (e) {
          console.warn('删除旧 OpenCode 会话失败（可能已不存在）:', (e as Error).message)
        }
      }

      // Step 5: 刷新本地 task 列表，同步 sessionId
      await loadTasks()
      ElMessage.success('已清空对话，AI 上下文已重置')
      return true
    } catch (e) {
      ElMessage.error('清空失败: ' + friendlyError(e))
      return false
    } finally {
      clearing.value = false
    }
  }

  // ---- 初始化入口 ----

  /**
   * 初始化指定飞机的任务上下文：
   * 1. 记录当前飞机标识（作为后端 aircraft_id）
   * 2. 按飞机拉取任务列表
   * 3. 若 initialization_required=true（该飞机无任何专属任务），静默自动创建一条默认会话（default=true）
   *    注意：tasks 可能含全局任务导致 length>0，故只看 initialization_required，不看 tasks.length。
   * 整个流程包在单个 loading 外壳内，对外只产生一次 loading true→false 跳变。
   */
  async function init(aircraftId: string) {
    currentAircraftId.value = aircraftId
    loadFromCookies()
    loading.value = true
    try {
      const initializationRequired = await loadTasks()
      if (initializationRequired) {
        await createTask({ name: '默认会话', description: '' }, { isDefault: true })
        await loadTasks()
      }
    } catch (e) {
      ElMessage.error('加载会话列表失败: ' + friendlyError(e))
    } finally {
      loading.value = false
    }
  }

  return {
    tasks,
    loading,
    creating,
    createStep,
    updating,
    clearing,
    currentTaskByAircraft,
    currentAircraftId,
    getCurrentTask,
    setCurrentTask,
    clearCurrentTask,
    fetchTasks,
    createTask,
    deleteTask,
    updateTask,
    clearTaskSession,
    init,
  }
})
