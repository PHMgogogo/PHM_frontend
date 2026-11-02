import { describe, expect, it } from 'vitest'
import { buildTimeseriesJobRequest, extractPersistedModel } from '@/utils/timeseries'
import type { Sortie } from '@/types/entities'

const sortie: Sortie = {
  sortieId: 12,
  sortieKey: '12',
  aircraftNumber: '20011',
  sortieNumber: '第312架次',
  flightDate: '2026-03-08',
  startTime: '08:15:00',
  endTime: '10:42:00',
  modelCode: 'JX-20A',
}

describe('buildTimeseriesJobRequest', () => {
  it('carries persisted model metadata for training', () => {
    const request = buildTimeseriesJobRequest({
      sortie,
      modelCode: 'JX-20A',
      mode: 'train',
      dataCols: [' ALTITUDE ', 'SPEED', 'ALTITUDE'],
      labelCols: ['FAULT'],
      instanceId: 'instance-1',
      taskId: 7,
      taskName: '增强诊断会话',
      modelName: ' 涡扇发动机 RUL 模型 ',
      modelDescription: ' 10 epoch baseline ',
      sourceType: 'local',
    })

    expect(request).toMatchObject({
      airplaneType: 'JX-20A',
      sortieId: '12',
      aircraftNumber: '20011',
      sortieNumber: '第312架次',
      flightDate: '2026-03-08',
      sourceType: 'local',
      task_id: 7,
      task_name: '增强诊断会话',
      model_name: '涡扇发动机 RUL 模型',
      model_description: '10 epoch baseline',
      data_cols: ['ALTITUDE', 'SPEED'],
      label_cols: ['FAULT'],
    })
  })

  it('does not attach model names to inference requests', () => {
    const request = buildTimeseriesJobRequest({
      sortie,
      modelCode: 'JX-20A',
      mode: 'infer',
      dataCols: ['ALTITUDE'],
      labelCols: [],
      instanceId: 'instance-1',
      modelName: 'ignored',
    })

    expect(request.model_name).toBeUndefined()
    expect(request.model_description).toBeUndefined()
  })
})

describe('extractPersistedModel', () => {
  it('accepts only a response containing a persisted model record', () => {
    const model = {
      model_id: 18,
      name: '温湿度诊断模型',
      instance_id: 'instance-1',
    }

    expect(extractPersistedModel({ result: [], model })).toMatchObject(model)
  })

  it('rejects a successful legacy response without model metadata', () => {
    expect(extractPersistedModel([{ loss: 0.1, outputs: [[1]], ids: [0] }])).toBeNull()
    expect(extractPersistedModel({ result: [] })).toBeNull()
    expect(extractPersistedModel(null)).toBeNull()
  })
})
