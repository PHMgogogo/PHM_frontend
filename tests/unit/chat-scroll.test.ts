import { describe, expect, it, vi } from 'vitest'
import {
  BottomScrollScheduler,
  bottomDistance,
  didMoveAwayFromBottom,
  isNearBottom,
  type ScrollMetrics,
} from '@/utils/chat-scroll'

function metrics(distance: number): ScrollMetrics {
  return { scrollHeight: 1_000, clientHeight: 400, scrollTop: 600 - distance }
}

describe('chat scroll metrics', () => {
  it('clamps browser overscroll and preserves positive distance', () => {
    expect(bottomDistance(metrics(-24))).toBe(0)
    expect(bottomDistance(metrics(140))).toBe(140)
  })

  it('uses an inclusive 72px sticky threshold', () => {
    expect(isNearBottom(metrics(71))).toBe(true)
    expect(isNearBottom(metrics(72))).toBe(true)
    expect(isNearBottom(metrics(73))).toBe(false)
  })

  it('distinguishes an upward user scroll from layout growth', () => {
    const anchored = metrics(0)
    expect(
      didMoveAwayFromBottom(anchored, {
        ...anchored,
        scrollTop: anchored.scrollTop - 180,
      }),
    ).toBe(true)
    expect(
      didMoveAwayFromBottom(anchored, {
        ...anchored,
        scrollHeight: anchored.scrollHeight + 318,
      }),
    ).toBe(false)
    expect(
      didMoveAwayFromBottom(anchored, {
        ...anchored,
        clientHeight: anchored.clientHeight - 80,
      }),
    ).toBe(false)
  })
})

describe('bottom scroll scheduler', () => {
  it('invalidates a queued frame before it can override user scroll intent', () => {
    const callbacks = new Map<number, () => void>()
    const cancelled: number[] = []
    let frameId = 0
    const scheduler = new BottomScrollScheduler(
      (callback) => {
        frameId += 1
        callbacks.set(frameId, callback)
        return frameId
      },
      (id) => cancelled.push(id),
    )
    const target = { scrollHeight: 1_000, scrollTop: 120 }
    let sticky = true

    scheduler.schedule(target, () => sticky)
    const queued = callbacks.get(1)
    sticky = false
    scheduler.invalidate()
    queued?.()

    expect(cancelled).toEqual([1])
    expect(target.scrollTop).toBe(120)
  })

  it('coalesces frames and checks ownership again before writing', () => {
    const callbacks = new Map<number, () => void>()
    const cancelFrame = vi.fn()
    let frameId = 0
    const scheduler = new BottomScrollScheduler(
      (callback) => {
        frameId += 1
        callbacks.set(frameId, callback)
        return frameId
      },
      cancelFrame,
    )
    const first = { scrollHeight: 900, scrollTop: 10 }
    const second = { scrollHeight: 1_200, scrollTop: 20 }

    scheduler.schedule(first, () => true)
    scheduler.schedule(second, () => true)
    callbacks.get(1)?.()
    callbacks.get(2)?.()

    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(first.scrollTop).toBe(10)
    expect(second.scrollTop).toBe(1_200)
  })
})
