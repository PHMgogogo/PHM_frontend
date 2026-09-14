// ============================================================
// 任务管理 API — 本地任务后端（192.168.31.32:8000）
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type {
  TaskResponse,
  TaskCreateRequest,
  TaskCreateResponse,
  AircraftTaskListResponse,
  TrainTaskRequest,
  InferTaskRequest,
  ApiResponse,
} from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.TASK })

export const taskApi = {
  /** 获取全部任务 */
  list() {
    return client.get<TaskResponse[]>('/tasks/')
  },

  /** 按飞机查询任务 */
  listByAircraft(aircraftId: string) {
    return client.get<AircraftTaskListResponse>(`/tasks/aircraft/${aircraftId}`)
  },

  /** 按 OpenCode session_id 查询任务详情 */
  getBySessionId(sessionId: string) {
    return client.get<TaskResponse>(`/tasks/session/${sessionId}`)
  },

  /** 创建任务 */
  create(data: TaskCreateRequest) {
    return client.post<TaskCreateResponse>('/tasks/', data)
  },

  /** 删除任务 */
  remove(taskId: number) {
    return client.del<void>(`/tasks/${taskId}`)
  },

  /** 按关键词搜索任务 */
  search(keyword: string) {
    return client.get<TaskResponse[]>('/tasks/search', { keyword })
  },

  /** 更新任务信息（部分更新，字段名保持 snake_case） */
  update(
    taskId: number,
    data: { name?: string; description?: string; model_code?: string; is_global?: boolean },
  ) {
    return client.put<TaskResponse>(`/tasks/${taskId}`, data)
  },

  /** 更新任务关联的 OpenCode session_id（/clear 换新 session 后同步绑定） */
  updateSessionId(taskId: number, sessionId: string) {
    return client.put<TaskResponse>(`/tasks/${taskId}`, { session_id: sessionId })
  },

  /** 通过已上传的 CSV 数据启动训练 */
  trainWithCsv(data: TrainTaskRequest) {
    return client.post<ApiResponse>('/tasks/train', data)
  },

  /** 通过已上传的 CSV 数据启动推理 */
  inferWithCsv(data: InferTaskRequest) {
    return client.post<ApiResponse>('/tasks/infer', data)
  }
}

