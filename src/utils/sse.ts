export interface SseLimits {
  maxFrameChars: number
  maxPendingChars: number
  maxTotalBytes: number
  maxEvents: number
}

export const SSE_LIMITS: Readonly<SseLimits> = Object.freeze({
  maxFrameChars: 1024 * 1024,
  maxPendingChars: 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxEvents: 50_000,
})

export type SseMalformedKind = 'invalid-json'
export type SseLimitKind = 'frame' | 'pending' | 'total-input' | 'events'

export class SseLimitError extends Error {
  constructor(public readonly kind: SseLimitKind) {
    super(`SSE response exceeded the ${kind} safety limit`)
    this.name = 'SseLimitError'
  }
}

export interface SseParserOptions {
  onEvent(event: unknown): void
  onMalformed?(kind: SseMalformedKind): void
  limits?: Partial<SseLimits>
}

export interface SseParser {
  push(chunk: Uint8Array): void
  finish(): void
}

export function createSseParser(options: SseParserOptions): SseParser {
  const limits: SseLimits = { ...SSE_LIMITS, ...options.limits }
  const decoder = new TextDecoder()
  let pending = ''
  let totalBytes = 0
  let eventCount = 0
  let finished = false

  function processFrame(frame: string): void {
    if (frame.length > limits.maxFrameChars) throw new SseLimitError('frame')

    const dataLines: string[] = []
    for (const rawLine of frame.split(/\r?\n/)) {
      if (!rawLine || rawLine.startsWith(':')) continue
      if (rawLine === 'data') {
        dataLines.push('')
      } else if (rawLine.startsWith('data:')) {
        const value = rawLine.slice(5)
        dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
      }
    }
    if (dataLines.length === 0) return

    eventCount += 1
    if (eventCount > limits.maxEvents) throw new SseLimitError('events')

    let event: unknown
    try {
      event = JSON.parse(dataLines.join('\n')) as unknown
    } catch {
      options.onMalformed?.('invalid-json')
      return
    }
    options.onEvent(event)
  }

  function drainDelimitedFrames(): void {
    while (true) {
      const boundary = /\r?\n\r?\n/.exec(pending)
      if (!boundary || boundary.index === undefined) break
      const frame = pending.slice(0, boundary.index)
      pending = pending.slice(boundary.index + boundary[0].length)
      processFrame(frame)
    }
    if (pending.length > limits.maxPendingChars) throw new SseLimitError('pending')
  }

  return {
    push(chunk: Uint8Array) {
      if (finished) throw new Error('SSE parser is already finished')
      totalBytes += chunk.byteLength
      if (totalBytes > limits.maxTotalBytes) throw new SseLimitError('total-input')
      pending += decoder.decode(chunk, { stream: true })
      drainDelimitedFrames()
    },

    finish() {
      if (finished) return
      finished = true
      pending += decoder.decode()
      drainDelimitedFrames()
      if (pending.trim()) processFrame(pending)
      pending = ''
    },
  }
}
