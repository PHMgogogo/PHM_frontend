import { createClient } from './client'
import type { TrainedModel } from '@/types/entities'

const client = createClient({ baseURL: '/api/analysis/models', timeout: 30_000 })

export interface TrainedModelQuery {
  aircraft_number?: string
  sortie_key?: string
  instance_id?: string
  model_code?: string
}

export interface TrainedModelUpdate {
  name?: string
  description?: string
}

export const trainedModelApi = {
  list(params: TrainedModelQuery = {}) {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(params)) {
      if (value) query[key] = value
    }
    return client.get<TrainedModel[]>('/', query)
  },

  update(modelId: number, data: TrainedModelUpdate) {
    return client.put<TrainedModel>(`/${modelId}`, data)
  },

  remove(modelId: number) {
    return client.del<{ detail: string }>(`/${modelId}`)
  },

  downloadUrl(modelId: number) {
    return `/api/analysis/models/${modelId}?mode=file`
  },
}
