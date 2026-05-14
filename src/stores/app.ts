import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  // 当前选中的飞机/机队 ID
  const selectedAircraftId = ref<string | null>(null)
  const selectedFleetId = ref<string | null>(null)

  function selectAircraft(id: string) {
    selectedAircraftId.value = id
  }

  function selectFleet(id: string) {
    selectedFleetId.value = id
    selectedAircraftId.value = null
  }

  function clearSelection() {
    selectedAircraftId.value = null
    selectedFleetId.value = null
  }

  return {
    selectedAircraftId,
    selectedFleetId,
    selectAircraft,
    selectFleet,
    clearSelection,
  }
})
