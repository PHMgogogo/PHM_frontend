export const LOCAL_SESSION_STORAGE_KEY = 'phm.knowledge.local-sessions.v1'
export const LOCAL_SESSION_LIMIT = 20

export interface LocalSessionReference {
  id: string
  seenAt: number
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function normalizeStoredItem(value: unknown): LocalSessionReference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id || record.id.length > 256) return null
  if (typeof record.seenAt !== 'number' || !Number.isFinite(record.seenAt)) return null
  return { id: record.id, seenAt: record.seenAt }
}

export function readLocalSessions(storage: StorageLike): LocalSessionReference[] {
  try {
    const raw = storage.getItem(LOCAL_SESSION_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeStoredItem)
      .filter((item): item is LocalSessionReference => item !== null)
      .slice(0, LOCAL_SESSION_LIMIT)
  } catch {
    return []
  }
}

export function rememberLocalSession(
  storage: StorageLike,
  id: string,
  seenAt = Date.now(),
): LocalSessionReference[] {
  const safeId = id.trim().slice(0, 256)
  const current = readLocalSessions(storage)
  if (!safeId) return current
  const next = [
    { id: safeId, seenAt },
    ...current.filter((item) => item.id !== safeId),
  ].slice(0, LOCAL_SESSION_LIMIT)
  try {
    storage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return current
  }
}

export function forgetLocalSession(storage: StorageLike, id: string): LocalSessionReference[] {
  const current = readLocalSessions(storage)
  const next = current.filter((item) => item.id !== id)
  try {
    if (next.length === 0) storage.removeItem(LOCAL_SESSION_STORAGE_KEY)
    else storage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return current
  }
}
