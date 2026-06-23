import { defineStore } from 'pinia'
import { ref } from 'vue'
import { planesData, squadronData } from '@/mock/demo/planes'

export const useDemoAppStore = defineStore('demoApp', () => {
  const selectedPlaneId = ref('P001')
  const selectedSquadronId = ref<string | null>(null)
  const selectorMode = ref('plane') // 'plane' | 'squadron'

  const planes = ref(planesData)
  const squadrons = ref(squadronData)

  function selectPlane(id: string) {
    selectedPlaneId.value = id
    selectorMode.value = 'plane'
  }

  function selectSquadron(id: string) {
    selectedSquadronId.value = id
    selectorMode.value = 'squadron'
  }

  function getPlaneById(id: string) {
    return planes.value.find((p: any) => p.id === id)
  }

  function getPlanesBySquadron(squadronId: string) {
    const sq = squadrons.value.find((s: any) => s.id === squadronId)
    if (!sq) return []
    return planes.value.filter((p: any) => sq.planeIds.includes(p.id))
  }

  return {
    selectedPlaneId,
    selectedSquadronId,
    selectorMode,
    planes,
    squadrons,
    selectPlane,
    selectSquadron,
    getPlaneById,
    getPlanesBySquadron,
  }
})
