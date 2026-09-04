export interface ScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export interface ScrollTarget {
  scrollHeight: number
  scrollTop: number
}

type RequestFrame = (callback: () => void) => number
type CancelFrame = (frameId: number) => void

export const DEFAULT_STICK_THRESHOLD = 72

export function bottomDistance(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight)
}

export function isNearBottom(
  metrics: ScrollMetrics,
  threshold = DEFAULT_STICK_THRESHOLD,
): boolean {
  return bottomDistance(metrics) <= Math.max(0, threshold)
}

export function didMoveAwayFromBottom(
  previous: ScrollMetrics | null,
  current: ScrollMetrics,
  threshold = DEFAULT_STICK_THRESHOLD,
): boolean {
  if (!previous || isNearBottom(current, threshold)) return false
  return current.scrollTop < previous.scrollTop
}

export class BottomScrollScheduler {
  private frameId: number | null = null
  private generation = 0

  constructor(
    private readonly requestFrame: RequestFrame,
    private readonly cancelFrame: CancelFrame,
  ) {}

  schedule(target: ScrollTarget, canScroll: () => boolean, onScroll?: () => void): void {
    this.cancelPending()
    const generation = ++this.generation
    this.frameId = this.requestFrame(() => {
      if (generation !== this.generation) return
      this.frameId = null
      if (!canScroll()) return
      target.scrollTop = target.scrollHeight
      onScroll?.()
    })
  }

  invalidate(): void {
    this.generation += 1
    this.cancelPending()
  }

  private cancelPending(): void {
    if (this.frameId === null) return
    this.cancelFrame(this.frameId)
    this.frameId = null
  }
}
