// ============================================================
// 算法实例 API — 远程算法服务器（192.168.31.13:8001）
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type { InstanceResponse } from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.PMGR, timeout: 60000 })

export const instanceApi = {
  /** 启动一个算法实例（GET /highlevel） */
  start() {
    return client.get<InstanceResponse>('/highlevel')
  },

  /** 删除一个算法实例（DELETE /highlevel/{instance_id_or_prefix}） */
  remove(instanceIdOrPrefix: string) {
    return client.del<void>(`/highlevel/${instanceIdOrPrefix}`)
  },

  /** 重启算法实例（OpenAPI 规范为 GET） */
  restart(instanceId: string) {
    return client.get<InstanceResponse>(`/highlevel/${instanceId}/restart`)
  },
}
