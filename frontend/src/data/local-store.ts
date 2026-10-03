import { activeManifest } from './seed-manifest'
import { SEED_ROWS, SEED_VERSION } from './seed'
import type { EntryRow, ResetLog, ResetResult } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'
const META_KEY = 'district-heating:seed-meta'
const RESET_LOG_KEY = 'district-heating:reset-log'

// 复位记录最多留几条
const RESET_LOG_LIMIT = 20

type SeedMeta = {
  seedVersion: string
  resetToken: string
  bootCount: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function seedSnapshot(resetToken: string): { data: Record<string, EntryRow[]>; meta: SeedMeta } {
  return {
    data: clone(SEED_ROWS),
    meta: { seedVersion: SEED_VERSION, resetToken, bootCount: 0 },
  }
}

function writePersist(data: Record<string, EntryRow[]>, meta: SeedMeta): void {
  if (!hasStorage()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

function readPersist(): {
  data: Record<string, EntryRow[]> | null
  meta: SeedMeta | null
  dataBroken: boolean
  metaBroken: boolean
} {
  if (!hasStorage()) {
    return { data: null, meta: null, dataBroken: false, metaBroken: false }
  }
  const dataRaw = window.localStorage.getItem(STORAGE_KEY)
  const metaRaw = window.localStorage.getItem(META_KEY)
  let data: Record<string, EntryRow[]> | null = null
  let meta: SeedMeta | null = null
  let dataBroken = false
  let metaBroken = false
  if (dataRaw) {
    try {
      data = JSON.parse(dataRaw) as Record<string, EntryRow[]>
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        data = null
        dataBroken = true
      }
    } catch {
      dataBroken = true
    }
  }
  if (metaRaw) {
    try {
      const parsed = JSON.parse(metaRaw) as SeedMeta
      if (parsed && typeof parsed.seedVersion === 'string') {
        meta = parsed
      } else {
        metaBroken = true
      }
    } catch {
      metaBroken = true
    }
  }
  return { data, meta, dataBroken, metaBroken }
}

function totalsOf(data: Record<string, EntryRow[]>): {
  total: number
  pending: number
  abnormal: number
} {
  let total = 0
  let pending = 0
  let abnormal = 0
  for (const rows of Object.values(data)) {
    for (const row of rows) {
      total += 1
      if (row.pending) pending += 1
      if (row.abnormal) abnormal += 1
    }
  }
  return { total, pending, abnormal }
}

// 结构归一化：只补齐/剔除模块键，不动各模块已有行（那是用户的在办数据）。
function repairShape(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const repaired: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(SEED_ROWS)) {
    repaired[key] = Array.isArray(data[key]) ? data[key] : clone(SEED_ROWS[key])
  }
  return repaired
}

function shapeMatches(data: Record<string, EntryRow[]> | null): boolean {
  if (!data) return false
  const storedKeys = Object.keys(data).sort()
  const seedKeys = Object.keys(SEED_ROWS).sort()
  if (storedKeys.length !== seedKeys.length) return false
  return seedKeys.every((key, index) => key === storedKeys[index] && Array.isArray(data[key]))
}

function readResetLogs(): ResetLog[] {
  if (!hasStorage()) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESET_LOG_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as ResetLog[]) : []
  } catch {
    return []
  }
}

function appendResetLog(entry: Omit<ResetLog, 'signature'> & { signature?: string }): {
  log: ResetLog
  recorded: boolean
} {
  const signature =
    entry.signature ??
    `${entry.reason}@${entry.seedVersion}:${entry.total}/${entry.pending}/${entry.abnormal}`
  const logs = readResetLogs()
  if (logs[0]?.signature === signature) {
    return { log: logs[0], recorded: false }
  }
  const log: ResetLog = { ...entry, signature }
  writeResetLogs([log, ...logs].slice(0, RESET_LOG_LIMIT))
  return { log, recorded: true }
}

function writeResetLogs(logs: ResetLog[]): void {
  if (hasStorage()) {
    window.localStorage.setItem(RESET_LOG_KEY, JSON.stringify(logs))
  }
}

// 整体重播种子：复位入口（页面按钮）与启动归一化（版本/令牌变化）共用这一条路。
function applyReseed(reason: string, previous?: SeedMeta | null): ResetResult {
  const manifest = activeManifest()
  // 页面/代码触发的复位（reseedAll）就认当前生效的令牌，播完与之一致，
  // 刷新页面不会误判成「又一次复位」。
  const resetToken = manifest?.resetToken ?? SEED_VERSION
  const { data } = seedSnapshot(resetToken)
  const previousBoot = previous?.bootCount ?? 0
  const nextMeta: SeedMeta = { seedVersion: SEED_VERSION, resetToken, bootCount: previousBoot + 1 }
  writePersist(data, nextMeta)
  cache = data
  const { total, pending, abnormal } = totalsOf(data)
  const { log, recorded } = appendResetLog({
    at: new Date().toISOString(),
    reason,
    seedVersion: SEED_VERSION,
    total,
    pending,
    abnormal,
  })
  return {
    ok: true,
    recorded,
    total,
    pending,
    abnormal,
    resetLog: log,
    message: recorded
      ? `已按种子数据复位全部 ${Object.keys(data).length} 个模块，共 ${total} 条登记，待处理 ${pending} 条`
      : '本地数据已是种子状态，重复复位未重复记录',
  }
}

let cache: Record<string, EntryRow[]> | null = null
let booted = false

// 启动归一化：版本变了（上一轮种子）整体换播；令牌变了（reset-local）整体重播；
// 只是模块键缺了/多了就补齐剔除。跑完概览与各模块明细必然同源同量。
function ensureBoot(): Record<string, EntryRow[]> {
  if (booted && cache) {
    return cache
  }
  booted = true
  if (!hasStorage()) {
    cache = clone(SEED_ROWS)
    return cache
  }
  const { data, meta, dataBroken, metaBroken } = readPersist()
  const manifest = activeManifest()
  const expectedToken = manifest?.resetToken ?? SEED_VERSION

  if (data === null) {
    // 全新浏览器 / 数据被手工清掉 / 存储损坏：首次播种，不算复位操作，不记复位日志。
    const fresh = seedSnapshot(expectedToken)
    cache = fresh.data
    writePersist(fresh.data, { ...fresh.meta, bootCount: 1 })
    return cache
  }

  if (meta && meta.seedVersion !== SEED_VERSION) {
    // 明确是「上一轮」种子（带旧版本号）：整体换播。
    applyReseed(`种子数据已更新（${meta.seedVersion} → ${SEED_VERSION}）`, meta)
    return cache as Record<string, EntryRow[]>
  }

  if (meta && meta.resetToken !== expectedToken) {
    // 版本相同但复位令牌换了（reset-local）：整体重播同一份种子。
    applyReseed(manifest?.reason || '本地复位', meta)
    return cache as Record<string, EntryRow[]>
  }

  if (!shapeMatches(data)) {
    // 缺 meta 的老数据 / 模块键缺了或多了：只补齐剔除结构，保留各模块在办数据。
    const repaired = repairShape(data)
    cache = repaired
    writePersist(repaired, {
      seedVersion: SEED_VERSION,
      resetToken: expectedToken,
      bootCount: (meta?.bootCount ?? 0) + 1,
    })
    return repaired
  }

  // 数据完好：meta 缺失或轻微损坏时静默补写，不动任何业务行。
  cache = data
  if (!meta || dataBroken || metaBroken) {
    writePersist(data, {
      seedVersion: SEED_VERSION,
      resetToken: expectedToken,
      bootCount: (meta?.bootCount ?? 0) + 1,
    })
  }
  return data
}

export function allRows(): Record<string, EntryRow[]> {
  return ensureBoot()
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (hasStorage()) {
    const { meta } = readPersist()
    const base: SeedMeta = meta ?? { seedVersion: SEED_VERSION, resetToken: SEED_VERSION, bootCount: 0 }
    writePersist(next, { ...base, seedVersion: SEED_VERSION, bootCount: base.bootCount + 1 })
  }
}

// 单模块复位：沿用既有做法（README 里的 resetModule）。
export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 复位入口：页面按钮调用，把所有模块的待处理清单一起归位到种子状态。
export function reseedAll(reason = '页面手动复位'): ResetResult {
  const { meta } = readPersist()
  // 先确保存储结构可读；applyReseed 会整体重播并做复位记录去重。
  return applyReseed(reason, meta ?? undefined)
}

export function resetLogs(): ResetLog[] {
  return readResetLogs()
}

export function lastReset(): ResetLog | null {
  return readResetLogs()[0] ?? null
}

export function seedVersion(): string {
  return SEED_VERSION
}

export function storageKey(): string {
  return STORAGE_KEY
}
