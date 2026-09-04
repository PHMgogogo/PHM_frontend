import { describe, expect, it } from 'vitest'
import { extractApiErrorMessage } from '@/api/client'

describe('API error normalization', () => {
  it('extracts FastAPI detail without exposing object JSON noise', () => {
    expect(extractApiErrorMessage({ detail: '相同内容的文件已存在' }, 409)).toBe(
      '相同内容的文件已存在',
    )
    expect(
      extractApiErrorMessage(
        { detail: [{ loc: ['body', 'message'], msg: '不能为空', type: 'value_error' }] },
        422,
      ),
    ).toBe('不能为空')
  })

  it('falls back to a status-aware friendly message', () => {
    expect(extractApiErrorMessage(undefined, 503)).toBe('请求失败（503）')
  })
})
