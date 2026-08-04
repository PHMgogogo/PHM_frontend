// ============================================================
// Instance Worker API — 对实例内模型进行操作
//
// 路径转换：
//   前端请求: /instance/{instance_id}/train
//     → Vite proxy 匹配 '/instance'，rewrite 去掉前缀
//     → 转发到: http://192.168.31.13:8001/{instance_id}/train
// ============================================================

import { createClient } from './client'
import type {
  LoadRequest,
  SaveRequest,
  TrainRequest,
  InferRequest,
  ModelResult,
  StateResponse,
} from '@/types/entities'

// ---- 客户端缓存：每个 instance_id 对应一个 client ----

const clientCache = new Map<string, ReturnType<typeof createClient>>()

function getWorkerClient(instanceId: string) {
  const existing = clientCache.get(instanceId)
  if (existing) return existing
  const client = createClient({ baseURL: `/${instanceId}`, timeout: 60000 })
  clientCache.set(instanceId, client)
  return client
}

/** 实例销毁时清理对应 client 缓存 */
export function clearWorkerClient(instanceId: string) {
  clientCache.delete(instanceId)
}

// ---- API 函数 ----

export const workerApi = {
  /** POST /load — 加载/新建模型 */
  load(instanceId: string, data: LoadRequest) {
    return getWorkerClient(instanceId).post<ModelResult[]>('/load', data)
  },

  /** POST /unload — 卸载模型释放资源 */
  unload(instanceId: string) {
    return getWorkerClient(instanceId).post<void>('/unload')
  },

  /** POST /save — 保存模型权重到服务器 */
  save(instanceId: string, data: SaveRequest) {
    return getWorkerClient(instanceId).post<ModelResult[]>('/save', data)
  },

  /** POST /train — 启动训练 */
  train(instanceId: string, data: TrainRequest) {
    return getWorkerClient(instanceId).post<ModelResult[]>('/train', data)
  },

  /** POST /infer — 启动推理 */
  infer(instanceId: string, data: InferRequest) {
    return getWorkerClient(instanceId).post<ModelResult[]>('/infer', data)
  },

  /** GET /state/{n} — 轮询状态与进度 */
  getState(instanceId: string, n: number = 1) {
    return getWorkerClient(instanceId).get<StateResponse>(`/state/${n}`)
  },

  /** GET /stop — 中断当前训练/推理 */
  stop(instanceId: string) {
    return getWorkerClient(instanceId).get<void>('/stop')
  },

  /** GET /wait — 阻塞等待当前任务完成 */
  wait(instanceId: string) {
    return getWorkerClient(instanceId).get<void>('/wait')
  },
}
