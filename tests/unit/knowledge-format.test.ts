import { describe, expect, it } from 'vitest'
import {
  canDeleteDocument,
  confidencePresentation,
  documentStatusPresentation,
  retrievalScorePresentation,
} from '@/utils/knowledge-format'

describe('knowledge trust formatting', () => {
  it.each([
    ['processing', '处理中', 'warning'],
    ['indexed', '已索引', 'success'],
    ['failed', '处理失败', 'danger'],
    ['future-state', '未知状态', 'info'],
  ])('maps document state %s honestly', (status, label, tone) => {
    expect(documentStatusPresentation(status)).toMatchObject({ label, tone })
  })

  it('never presents unavailable confidence as zero', () => {
    expect(confidencePresentation(null)).toEqual({ kind: 'unavailable', label: '未评估' })
    expect(confidencePresentation(Number.NaN)).toEqual({ kind: 'unavailable', label: '未评估' })
    expect(confidencePresentation(0)).toMatchObject({ kind: 'available', label: '0%' })
  })

  it('treats low-level main score zero as ambiguous instead of a definite score', () => {
    expect(retrievalScorePresentation(undefined, true)).toEqual({
      kind: 'unavailable',
      label: '未提供',
    })
    expect(retrievalScorePresentation(0, true)).toEqual({
      kind: 'ambiguous-zero',
      label: '未确认（服务返回 0）',
    })
    expect(retrievalScorePresentation(0, false)).toEqual({ kind: 'available', label: '0.0000' })
    expect(retrievalScorePresentation(0.375, true)).toEqual({
      kind: 'available',
      label: '0.3750',
    })
  })

  it('never permits deleting processing or unknown documents', () => {
    expect(canDeleteDocument('processing', true)).toBe(false)
    expect(canDeleteDocument('unknown', true)).toBe(false)
    expect(canDeleteDocument('indexed', false)).toBe(false)
    expect(canDeleteDocument('indexed', true)).toBe(true)
    expect(canDeleteDocument('failed', true)).toBe(true)
  })
})
