import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AlgorithmStatus = 'idle' | 'running' | 'stopped' | 'error'

export interface Algorithm {
  id: string
  aircraftId: string
  name: string
  dataSourceId: string
  dataSourceName: string
  status: AlgorithmStatus
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

const STATUS_LABELS: Record<AlgorithmStatus, string> = {
  idle: '未启动',
  running: '运行中',
  stopped: '已停止',
  error: '异常',
}

const STATUS_TYPES: Record<AlgorithmStatus, string> = {
  idle: 'info',
  running: 'success',
  stopped: 'warning',
  error: 'danger',
}

export const useAlgorithmStore = defineStore('algorithm', () => {
  const algorithms = ref<Algorithm[]>([])

  function getByAircraft(aircraftId: string) {
    return algorithms.value.filter((a) => a.aircraftId === aircraftId)
  }

  function add(payload: Omit<Algorithm, 'id' | 'status'>) {
    const item: Algorithm = { ...payload, id: genId(), status: 'idle' }
    algorithms.value.push(item)
    return item
  }

  function remove(id: string) {
    algorithms.value = algorithms.value.filter((a) => a.id !== id)
  }

  function setStatus(id: string, status: AlgorithmStatus) {
    const alg = algorithms.value.find((a) => a.id === id)
    if (alg) alg.status = status
  }

  return { algorithms, getByAircraft, add, remove, setStatus, STATUS_LABELS, STATUS_TYPES }
})
