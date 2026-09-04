import { describe, expect, it } from 'vitest'
import {
  forgetLocalSession,
  LOCAL_SESSION_STORAGE_KEY,
  readLocalSessions,
  rememberLocalSession,
} from '@/utils/local-sessions'

describe('device-local RAG session registry', () => {
  it('stores only session id and seenAt, never conversation content', () => {
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    }

    rememberLocalSession(adapter, 'session-1', 123)

    expect(readLocalSessions(adapter)).toEqual([{ id: 'session-1', seenAt: 123 }])
    expect(storage.get(LOCAL_SESSION_STORAGE_KEY)).toBe('[{"id":"session-1","seenAt":123}]')
  })

  it('keeps a 20-item LRU and forgets locally without a remote request', () => {
    localStorage.clear()
    for (let index = 0; index < 22; index += 1) {
      rememberLocalSession(localStorage, `session-${index}`, index)
    }
    expect(readLocalSessions(localStorage)).toHaveLength(20)
    expect(readLocalSessions(localStorage)[0]).toEqual({ id: 'session-21', seenAt: 21 })

    forgetLocalSession(localStorage, 'session-21')
    expect(readLocalSessions(localStorage).some((item) => item.id === 'session-21')).toBe(false)
  })

  it('fails closed on malformed stored data', () => {
    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, '{bad-json')
    expect(readLocalSessions(localStorage)).toEqual([])
  })

  it('does not break the chat flow or claim a change when storage writes are blocked', () => {
    const original = [{ id: 'session-existing', seenAt: 123 }]
    const blockedStorage = {
      getItem: () => JSON.stringify(original),
      setItem: () => {
        throw new DOMException('blocked', 'QuotaExceededError')
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    }

    expect(rememberLocalSession(blockedStorage, 'session-new', 456)).toEqual(original)
    expect(forgetLocalSession(blockedStorage, 'session-existing')).toEqual(original)
  })
})
