import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AircraftConfig {
  id: string
  configName: string
  mappings: Record<string, string>
}

export interface Aircraft {
  id: string
  name: string
  type: string
  configId?: string
  configName?: string
  createdAt?: string
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

export const useAircraftStore = defineStore('aircraft', () => {
  const configs = ref<AircraftConfig[]>([
    {
      id: generateId(),
      configName: '标准固定翼构型',
      mappings: {
        飞行时间: '1',
        发动机温度: '23',
        机翼振动: '25',
        油压: '67',
      },
    },
    {
      id: generateId(),
      configName: '通用旋翼机构型',
      mappings: {
        飞行时间: '1',
        旋翼转速: '12',
        机身振动: '34',
      },
    },
  ])

  const aircrafts = ref<Aircraft[]>([
    {
      id: generateId(),
      name: 'PHM-001',
      type: '固定翼',
      configId: configs.value[0].id,
      configName: configs.value[0].configName,
      createdAt: '2026-01-15',
    },
    {
      id: generateId(),
      name: 'UAV-Alpha',
      type: '无人机',
      configId: configs.value[1].id,
      configName: configs.value[1].configName,
      createdAt: '2026-03-20',
    },
    {
      id: generateId(),
      name: 'Heli-009',
      type: '旋翼机',
      createdAt: '2026-04-08',
    },
  ])

  function addAircraft(aircraft: Omit<Aircraft, 'id' | 'createdAt'>) {
    const newAircraft: Aircraft = {
      ...aircraft,
      id: generateId(),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    aircrafts.value.push(newAircraft)
  }

  function addConfig(config: Omit<AircraftConfig, 'id'>) {
    const newConfig: AircraftConfig = {
      ...config,
      id: generateId(),
    }
    configs.value.push(newConfig)
    return newConfig
  }

  function deleteConfig(id: string) {
    configs.value = configs.value.filter((c) => c.id !== id)
    // 解绑使用该构型的飞行器
    aircrafts.value.forEach((a) => {
      if (a.configId === id) {
        a.configId = undefined
        a.configName = undefined
      }
    })
  }

  return {
    configs,
    aircrafts,
    addAircraft,
    addConfig,
    deleteConfig,
  }
})
