import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  // 当前选中的飞机/机队 ID
  const selectedaircraftNumber = ref<string | null>(null)
  const selectedFleetId = ref<string | null>(null)

  function selectAircraft(id: string) {
    selectedaircraftNumber.value = id
  }

  function selectFleet(id: string) {
    selectedFleetId.value = id
    selectedaircraftNumber.value = null
  }

  function clearSelection() {
    selectedaircraftNumber.value = null
    selectedFleetId.value = null
  }

  return {
    selectedaircraftNumber,
    selectedFleetId,
    selectAircraft,
    selectFleet,
    clearSelection,
  }
})
