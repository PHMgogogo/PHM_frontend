import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { taskApi } from '@/api/task'
import { instanceApi, DEFAULT_HIGHLEVEL_ALGO } from '@/api/instance'
import type { HighLevelAlgo } from '@/api/instance'
import { clearWorkerClient } from '@/api/instance-worker'
import { opencodeApi } from '@/api/opencode'
import { useChatStore, DEFAULT_MODEL_REF } from '@/stores/chat'
import type { Task } from '@/types/entities'
import { API_PREFIX, OPENCODE_AUTH } from '@/config/endpoints'

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

export const useTaskStore = defineStore('task', () => {
  // ---- 状态 ----
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const createStep = ref('')
  const updating = ref(false)
  const clearing = ref(false)

  /** 当前正在对话的任务 ID（仅内存，不做任何持久化） */
  const currentTaskId = ref<number | null>(null)

  /** 当前工作区所属飞机标识（即后端 aircraft_id），由 init() 设置，供 loadTasks/createTask 复用 */
  const currentAircraftId = ref('')

  /** 当前工作区对应机型（后端 model_code），由 init() 设置，供 createTask 提交时复用 */
  const currentModelCode = ref('')

  // ---- 当前任务 ----

  /** 获取当前正在对话的任务 */
  const currentTask = computed(() =>
    currentTaskId.value === null
      ? undefined
      : tasks.value.find((t) => t.id === currentTaskId.value),
  )

  function setCurrentTask(taskId: number) {
    currentTaskId.value = taskId
  }

  function clearCurrentTask() {
    currentTaskId.value = null
  }

  // ---- 任务列表 ----

  /**
   * 加载并映射当前飞机的任务列表（不切换 loading，供 init/createTask 等在外壳内复用）。
   */
  async function loadTasks(): Promise<void> {
    const res = await taskApi.listByAircraft(currentAircraftId.value)
    if (res.stale_check_failed) {
      ElMessage.warning('实例状态校验暂时不可用，列表可能包含已失效的会话')
    }
    tasks.value = res.tasks.map((r) => ({
      id: r.task_id,
      name: r.name,
      description: r.description,
      sessionId: r.session_id,
      instanceId: r.instance_id || '',
      modelCode: r.model_code || '',
      workDir: r.work_dir || '',
      aircraftId: r.aircraft_id || '',
      isGlobal: r.is_global ?? false,
      createdAt: '',
      updatedAt: '',
    }))
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
    data: { name: string; description: string; algo?: HighLevelAlgo },
  ): Promise<Task | null> {
    creating.value = true
    let instanceId = ''
    let sessionId = ''

    try {
      // Step 1: 启动实例（可指定基础算法）
      createStep.value = '正在启动实例...'
      const inst = await instanceApi.start(data.algo ?? DEFAULT_HIGHLEVEL_ALGO)
      instanceId = inst.instance_id

      // Step 2: 处理工作目录路径
      createStep.value = '正在连接工作区...'
      const workDir = convertPath(inst.file_path)
      const sessionOpts = {
        base: API_PREFIX.OPENCODE,
        dir: workDir,
        user: OPENCODE_AUTH.user,
        pass: OPENCODE_AUTH.pass,
      }

      // Step 3: 创建 OpenCode 会话
      createStep.value = '正在创建会话...'
      const session = await opencodeApi.create(sessionOpts, data.name, DEFAULT_MODEL_REF, workDir)
      sessionId = session.data.id

      // Step 4: 保存任务到本地后端（会话恒为单机可见，不写全局标记）
      createStep.value = '正在保存会话...'
      await taskApi.create({
        name: data.name,
        description: data.description || '',
        session_id: sessionId,
        instance_id: instanceId,
        work_dir: workDir,
        aircraft_id: currentAircraftId.value,
        model_code: currentModelCode.value,
        is_global: false,
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
          {
            base: API_PREFIX.OPENCODE,
            dir: task.workDir,
            user: OPENCODE_AUTH.user,
            pass: OPENCODE_AUTH.pass,
          },
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

    // 若删除的是当前任务，清空当前任务
    if (currentTaskId.value === taskId) {
      currentTaskId.value = null
    }

    ElMessage.success('会话已删除')
  }

  // ---- 更新任务信息 ----

  async function updateTask(
    taskId: number,
    data: { name: string; description: string; modelCode?: string; isGlobal?: boolean },
  ) {
    updating.value = true
    try {
      await taskApi.update(taskId, {
        name: data.name,
        description: data.description,
        model_code: data.modelCode,
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

  // ---- 清空对话（/clear：基于当前 workDir 重建会话，重置 AI 上下文） ----

  /**
   * 清空 = 重建：在当前任务的工作目录（workDir）下新建一个 OpenCode session，
   * 保持与创建任务一致的上下文（同一目录、同一默认模型，后端会重写 AGENTS.md），
   * 然后同步 task 记录的 session_id、切换 chat 连接、删除旧 session。
   * 工作目录缺失时拒绝重建：否则新 session 会落到服务端默认目录，与创建出的会话行为不一致。
   */
  async function clearTaskSession(taskId: number): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) {
      ElMessage.error('会话不存在')
      return false
    }

    const chatStore = useChatStore()
    if (chatStore.sessionBusy) {
      ElMessage.warning('对话进行中，请先中止后再重建')
      return false
    }

    const workDir = task.workDir
    if (!workDir) {
      ElMessage.error('缺少工作目录，无法重建会话，请重新创建会话')
      return false
    }

    // 重建仍复用原任务的 session 绑定与工作目录
    const oldSid = task.sessionId
    const sessionOpts = {
      base: API_PREFIX.OPENCODE,
      dir: workDir,
      user: OPENCODE_AUTH.user,
      pass: OPENCODE_AUTH.pass,
    }

    clearing.value = true
    try {
      // Step 1: 在当前工作目录下创建新 session（全新上下文，同 createTask 的 Step 3）
      const session = await opencodeApi.create(sessionOpts, task.name, DEFAULT_MODEL_REF, workDir)

      // Step 2: 同步 task 记录的 session_id（必须成功，否则重开任务会连回旧 session）
      try {
        await taskApi.updateSessionId(taskId, session.data.id)
      } catch (e) {
        // 回滚：删除刚创建的孤立新 session，保持原绑定不变
        try {
          await opencodeApi.deleteSession(sessionOpts, session.data.id)
        } catch {
          /* 忽略清理失败 */
        }
        throw e
      }

      // Step 3: 切换 chat 连接到新 session（内部 dispose 旧 SSE + 拉取空消息）
      await chatStore.connectToSession(session.data.id, workDir)

      // Step 4: 删除旧 session（best-effort，失败不阻塞）
      if (oldSid && oldSid !== session.data.id) {
        try {
          await opencodeApi.deleteSession(sessionOpts, oldSid)
        } catch (e) {
          console.warn('删除旧 OpenCode 会话失败（可能已不存在）:', (e as Error).message)
        }
      }

      // Step 5: 刷新本地 task 列表，同步 sessionId
      await loadTasks()
      ElMessage.success('会话已重建，AI 上下文已重置')
      return true
    } catch (e) {
      ElMessage.error('重建会话失败: ' + friendlyError(e))
      return false
    } finally {
      clearing.value = false
    }
  }

  // ---- 初始化入口 ----

  /**
   * 初始化指定飞机的任务上下文：
   * 1. 记录当前飞机标识（作为后端 aircraft_id）与机型（model_code）
   * 2. 按飞机拉取任务列表
   * 不再自动创建默认会话：无会话时由页面停靠在会话列表，待用户主动创建。
   */
  async function init(aircraftId: string, modelCode = '') {
    currentAircraftId.value = aircraftId
    currentModelCode.value = modelCode
    loading.value = true
    try {
      await loadTasks()
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
    currentTaskId,
    currentAircraftId,
    currentModelCode,
    currentTask,
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
