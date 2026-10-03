// 脚本与页面共用的种子库：直接 import src/data/seed.ts，保证两处读同一份种子数据。
// 由 tsx 执行（package.json devDependency），不能引入带 '@/...' 别名或 import.meta.glob 的模块。
import { renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODULES } from '../src/data/modules.ts'
import { SEED_ROWS, SEED_VERSION } from '../src/data/seed.ts'

export interface SeedManifestModule {
  key: string
  name: string
  count: number
  pending: number
  abnormal: number
}

export interface SeedManifest {
  kind: 'seed-manifest'
  source: 'setup' | 'reset-local'
  seedVersion: string
  resetToken: string
  reason?: string
  generatedAt?: string
  totals: { modules: number; created: number; pending: number; abnormal: number }
  modules: SeedManifestModule[]
}

const here = dirname(fileURLToPath(import.meta.url))
export const FRONTEND_DIR = resolve(here, '..')
export const MANIFEST_PATH = resolve(FRONTEND_DIR, 'src/data/seed-manifest.json')
export const LOCAL_MANIFEST_PATH = resolve(FRONTEND_DIR, 'src/data/seed-manifest.local.json')
export const SETUP_STATE_PATH = resolve(FRONTEND_DIR, '.setup-state.json')

export function summarizeSeed(): {
  seedVersion: string
  totals: SeedManifest['totals']
  modules: SeedManifestModule[]
} {
  const modules: SeedManifestModule[] = MODULES.map((meta) => {
    const rows = SEED_ROWS[meta.key] ?? []
    return {
      key: meta.key,
      name: meta.name,
      count: rows.length,
      pending: rows.filter((row) => row.pending).length,
      abnormal: rows.filter((row) => row.abnormal).length,
    }
  })
  const totals = modules.reduce(
    (sum, item) => ({
      modules: sum.modules + 1,
      created: sum.created + item.count,
      pending: sum.pending + item.pending,
      abnormal: sum.abnormal + item.abnormal,
    }),
    { modules: 0, created: 0, pending: 0, abnormal: 0 },
  )
  return { seedVersion: SEED_VERSION, totals, modules }
}

export function buildManifest(
  source: 'setup' | 'reset-local',
  resetToken: string,
  reason?: string,
): SeedManifest {
  const { seedVersion, totals, modules } = summarizeSeed()
  const manifest: SeedManifest = {
    kind: 'seed-manifest',
    source,
    seedVersion,
    resetToken,
    ...(reason ? { reason } : {}),
    // setup 清单要提交进仓库：不带时间戳，种子没变时反复生成字节完全一致。
    // reset-local 清单只在本机使用，才需要时间戳留痕。
    ...(source === 'reset-local' ? { generatedAt: new Date().toISOString() } : {}),
    totals,
    modules,
  }
  return manifest
}

// 种子自检：每个模块都得有种子、id 不重复、概览总量必须等于各模块明细之和。
export function verifySeed(): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = []
  for (const meta of MODULES) {
    const rows = SEED_ROWS[meta.key]
    if (!Array.isArray(rows) || rows.length === 0) {
      problems.push(`模块 ${meta.key}（${meta.name}）缺少种子数据`)
      continue
    }
    const ids = new Set<number>()
    for (const row of rows) {
      if (ids.has(Number(row.id))) {
        problems.push(`模块 ${meta.key}（${meta.name}）存在重复 id：${row.id}`)
      }
      ids.add(Number(row.id))
    }
  }
  const seedKeys = Object.keys(SEED_ROWS).sort()
  const moduleKeys = MODULES.map((meta) => meta.key).sort()
  if (seedKeys.length !== moduleKeys.length || seedKeys.some((key, i) => key !== moduleKeys[i])) {
    problems.push(
      `SEED_ROWS 的模块（${seedKeys.join(',')}）与 modules.ts（${moduleKeys.join(',')}）不一致`,
    )
  }
  if (problems.length > 0) {
    return { ok: false, problems }
  }
  return { ok: true }
}

export function atomicWriteJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}
