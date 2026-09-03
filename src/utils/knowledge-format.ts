import type { DocumentStatus } from './knowledge-normalize'

export type PresentationTone = 'success' | 'warning' | 'danger' | 'info'

export interface StatusPresentation {
  label: string
  tone: PresentationTone
  description: string
}

export function documentStatusPresentation(status: string): StatusPresentation {
  switch (status) {
    case 'processing':
      return { label: '处理中', tone: 'warning', description: '正在解析并建立索引' }
    case 'indexed':
      return { label: '已索引', tone: 'success', description: '已进入可检索状态' }
    case 'failed':
      return { label: '处理失败', tone: 'danger', description: '未进入可检索状态' }
    default:
      return { label: '未知状态', tone: 'info', description: '服务返回了尚未识别的状态' }
  }
}

export interface ValuePresentation {
  kind: 'available' | 'unavailable' | 'ambiguous-zero'
  label: string
}

export function confidencePresentation(value: number | null | undefined): ValuePresentation {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { kind: 'unavailable', label: '未评估' }
  }
  const bounded = Math.min(1, Math.max(0, value))
  return { kind: 'available', label: `${Math.round(bounded * 100)}%` }
}

export function retrievalScorePresentation(
  value: number | null | undefined,
  ambiguousMainScore = false,
): ValuePresentation {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { kind: 'unavailable', label: '未提供' }
  }
  if (ambiguousMainScore && Object.is(value, 0)) {
    return { kind: 'ambiguous-zero', label: '未确认（服务返回 0）' }
  }
  return { kind: 'available', label: value.toFixed(4) }
}

export function canDeleteDocument(status: DocumentStatus | string, capability: boolean): boolean {
  return capability && (status === 'indexed' || status === 'failed')
}
