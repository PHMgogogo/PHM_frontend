import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as aircraftApi from '@/api/aircraft'
import type { AircraftModel, Aircraft } from '@/types/entities'

export const useAircraftStore = defineStore('aircraft', () => {
  // ---- 飞机构型 ----
  const models = ref<AircraftModel[]>([])
  const modelsLoading = ref(false)

  async function fetchModels() {
    modelsLoading.value = true
    try {
      models.value = await aircraftApi.getModels()
    } catch {
      models.value = []
    } finally {
      modelsLoading.value = false
    }
  }

  async function createModel(data: Omit<AircraftModel, 'createdAt'>) {
    await aircraftApi.createModel(data)
    await fetchModels()
  }

  async function deleteModel(modelCode: string) {
    await aircraftApi.deleteModel(modelCode)
    await fetchModels()
  }

  // ---- 飞机单机 ----
  const aircrafts = ref<Aircraft[]>([])
  const aircraftsLoading = ref(false)
  const aircraftNumbers = ref<string[]>([])

  async function fetchAircrafts(modelCode?: string) {
    aircraftsLoading.value = true
    try {
      aircrafts.value = await aircraftApi.getPlanes(modelCode)
    } catch {
      aircrafts.value = []
    } finally {
      aircraftsLoading.value = false
    }
  }

  async function createAircraft(data: Omit<Aircraft, 'createdAt'>) {
    await aircraftApi.createPlane(data)
    await fetchAircrafts()
  }

  async function deleteAircraft(aircraftNumber: string) {
    await aircraftApi.deletePlane(aircraftNumber)
    await fetchAircrafts()
  }

  async function fetchaircraftNumbers(modelCode: string) {
    try {
      aircraftNumbers.value = await aircraftApi.getAircraftNumbers(modelCode)
    } catch {
      aircraftNumbers.value = []
    }
  }

  return {
    models,
    modelsLoading,
    fetchModels,
    createModel,
    deleteModel,
    aircrafts,
    aircraftsLoading,
    fetchAircrafts,
    createAircraft,
    deleteAircraft,
    aircraftNumbers,
    fetchaircraftNumbers,
  }
})
