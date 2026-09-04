import { describe, expect, it } from 'vitest'
import { createSseParser, SseLimitError } from '@/utils/sse'

const encoder = new TextEncoder()

describe('incremental SSE parser', () => {
  it('handles UTF-8 split at every byte and CRLF frame boundaries', () => {
    const events: unknown[] = []
    const parser = createSseParser({ onEvent: (event) => events.push(event) })
    const payload = encoder.encode(
      'data: {"type":"token","content":"齿轮温度"}\r\n\r\ndata: {"type":"done","full_response":"完成"}\r\n\r\n',
    )

    for (const byte of payload) parser.push(Uint8Array.of(byte))
    parser.finish()

    expect(events).toEqual([
      { type: 'token', content: '齿轮温度' },
      { type: 'done', full_response: '完成' },
    ])
  })

  it('joins multiple data lines and continues after one malformed frame', () => {
    const events: unknown[] = []
    const malformed: string[] = []
    const parser = createSseParser({
      onEvent: (event) => events.push(event),
      onMalformed: (kind) => malformed.push(kind),
    })

    parser.push(
      encoder.encode(
        'data: {bad json}\n\ndata: {"type":"status",\ndata: "message":"检索中"}\n\n',
      ),
    )
    parser.finish()

    expect(malformed).toEqual(['invalid-json'])
    expect(events).toEqual([{ type: 'status', message: '检索中' }])
  })

  it('flushes a final complete data frame without a trailing blank line', () => {
    const events: unknown[] = []
    const parser = createSseParser({ onEvent: (event) => events.push(event) })
    parser.push(encoder.encode('data: {"type":"status","message":"生成中"}'))
    parser.finish()
    expect(events).toEqual([{ type: 'status', message: '生成中' }])
  })

  it('fails safely when pending data exceeds the configured resource budget', () => {
    const parser = createSseParser({
      onEvent: () => undefined,
      limits: { maxPendingChars: 16, maxFrameChars: 16, maxTotalBytes: 64 },
    })

    expect(() => parser.push(encoder.encode('data: xxxxxxxxxxxxxxxxx'))).toThrowError(
      SseLimitError,
    )
  })

  it('limits the event count without including raw frame content in the error', () => {
    const parser = createSseParser({
      onEvent: () => undefined,
      limits: { maxEvents: 1 },
    })
    try {
      parser.push(encoder.encode('data: {"type":"a"}\n\ndata: {"type":"secret-value"}\n\n'))
      parser.finish()
      throw new Error('expected parser to reject the second event')
    } catch (error) {
      expect(error).toBeInstanceOf(SseLimitError)
      expect(String(error)).not.toContain('secret-value')
    }
  })
})
