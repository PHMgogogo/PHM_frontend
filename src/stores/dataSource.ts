import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DataSource {
  id: string
  aircraftId: string
  name: string
  selectedFields: string[]
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

export const useDataSourceStore = defineStore('dataSource', () => {
  const dataSources = ref<DataSource[]>([])

  function getByAircraft(aircraftId: string) {
    return dataSources.value.filter((d) => d.aircraftId === aircraftId)
  }

  function add(payload: Omit<DataSource, 'id'>) {
    const item: DataSource = { ...payload, id: genId() }
    dataSources.value.push(item)
    return item
  }

  function remove(id: string) {
    dataSources.value = dataSources.value.filter((d) => d.id !== id)
  }

  return { dataSources, getByAircraft, add, remove }
})
