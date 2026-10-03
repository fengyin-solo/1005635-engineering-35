import { SEED_ROWS, SEED_VERSION } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'
const META_KEY = 'district-heating:meta'
const RESET_LOG_KEY = 'district-heating:reset-log'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedSnapshot(): Record<string, EntryRow[]> {
  return clone(SEED_ROWS)
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function writeMeta(): void {
  if (storageAvailable()) {
    window.localStorage.setItem(META_KEY, JSON.stringify({ seedVersion: SEED_VERSION }))
  }
}

// 只保留已登记模块、缺模块用种子补齐：概览总量和各模块清单永远从同一份数据算出来。
function normalize(stored: Record<string, unknown>): Record<string, EntryRow[]> {
  const snapshot = seedSnapshot()
  const normalized: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(snapshot)) {
    const rows = stored[key]
    normalized[key] = Array.isArray(rows) ? (rows as EntryRow[]) : clone(snapshot[key])
  }
  return normalized
}

function persistAll(rows: Record<string, EntryRow[]>): void {
  if (storageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
    writeMeta()
  }
}

function reseedAll(reason: string): Record<string, EntryRow[]> {
  const snapshot = seedSnapshot()
  persistAll(snapshot)
  if (typeof console !== 'undefined') {
    console.info(`[本地数据] ${reason}，已按当前种子数据重新播种（版本 ${SEED_VERSION}）`)
  }
  return snapshot
}

function readStorage(): Record<string, EntryRow[]> {
  if (!storageAvailable()) {
    return seedSnapshot()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return reseedAll('首次打开')
  }
  const metaRaw = window.localStorage.getItem(META_KEY)
  const storedVersion = (() => {
    try {
      return metaRaw ? String((JSON.parse(metaRaw) as { seedVersion?: unknown }).seedVersion ?? '') : ''
    } catch {
      return ''
    }
  })()
  if (storedVersion !== SEED_VERSION) {
    // 上一轮留下的旧数据：整份回到当前种子，概览与各模块清单重新对齐
    return reseedAll('本地数据还是上一轮的')
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return reseedAll('本地数据格式不对')
    }
    return normalize(parsed)
  } catch {
    return reseedAll('本地数据读不出来')
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persistAll(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

type ResetLogEntry = { token: string; at: string }

function readResetLog(): ResetLogEntry[] {
  if (!storageAvailable()) {
    return []
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESET_LOG_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as ResetLogEntry[]) : []
  } catch {
    return []
  }
}

// 回收入口（全模块复位）：所有模块回到种子数据，各模块待处理数跟着归位。
// 带 token 调用时同一个 token 只记一次：重复提交不会再写一遍，状态也不重复复位。
export function resetAllRows(token?: string): { applied: boolean } {
  const log = readResetLog()
  if (token && log.some((entry) => entry.token === token)) {
    return { applied: false }
  }
  const snapshot = seedSnapshot()
  cache = snapshot
  persistAll(snapshot)
  if (token) {
    log.push({ token, at: new Date().toISOString() })
    if (storageAvailable()) {
      window.localStorage.setItem(RESET_LOG_KEY, JSON.stringify(log))
    }
  }
  return { applied: true }
}

export function storageKey(): string {
  return STORAGE_KEY
}
