import { describe, expect, it } from 'vitest'
import { RunOwnership } from '@/utils/run-ownership'

describe('agent run ownership', () => {
  it('invalidates every token from a replaced run', () => {
    const ownership = new RunOwnership()
    const first = ownership.begin('session-a', 'message-a')
    const second = ownership.begin('session-b', 'message-b')

    expect(ownership.owns(first)).toBe(false)
    expect(ownership.owns(second)).toBe(true)
  })

  it('uses first-terminal-wins and ignores late callbacks', () => {
    const ownership = new RunOwnership()
    const token = ownership.begin('session-a', 'message-a')

    expect(ownership.commitTerminal(token, 'cancelled')).toBe(true)
    expect(ownership.commitTerminal(token, 'completed')).toBe(false)
    expect(ownership.owns(token)).toBe(false)
  })

  it('requires matching run, session, and assistant message identity', () => {
    const ownership = new RunOwnership()
    const token = ownership.begin('session-a', 'message-a')

    expect(ownership.owns({ ...token, sessionId: 'session-b' })).toBe(false)
    expect(ownership.owns({ ...token, assistantMessageId: 'message-b' })).toBe(false)
  })
})
