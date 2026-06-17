// ============================================================
// 任务管理 API — 本地任务后端（192.168.31.32:8000）
// ============================================================

import { createClient } from './client'
import type { TaskResponse, TaskCreateRequest, TaskCreateResponse } from '@/types/entities'

const client = createClient({ baseURL: '/task' })

export const taskApi = {
  /** 获取全部任务 */
  list() {
    return client.get<TaskResponse[]>('/tasks/')
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

  /** 更新任务信息 */
  update(taskId: number, data: { name: string; description?: string }) {
    return client.put<TaskResponse>(`/tasks/${taskId}`, data)
  },
}
