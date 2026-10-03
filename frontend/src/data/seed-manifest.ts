import { SEED_VERSION } from './seed'

import committedManifest from './seed-manifest.json'

// 种子清单由 scripts/seed-lib.mts 用同一份 SEED_ROWS 生成：
//   - seed-manifest.json        setup 生成并提交（全新克隆也能对上版本）
//   - seed-manifest.local.json  reset-local 生成（已忽略，换复位令牌用）
// 页面启动时以代码里的 SEED_VERSION 为准核对清单；清单对不上就提示重跑 setup。

export type SeedManifestModule = {
  key: string
  name: string
  count: number
  pending: number
  abnormal: number
}

export type SeedManifest = {
  kind: 'seed-manifest'
  source: 'setup' | 'reset-local'
  seedVersion: string
  resetToken: string
  reason?: string
  generatedAt?: string
  totals: { modules: number; created: number; pending: number; abnormal: number }
  modules: SeedManifestModule[]
}

export const COMMITTED_MANIFEST = committedManifest as SeedManifest

// 本地复位覆盖是可选文件：没跑过 reset-local 时文件不存在，glob 匹配为空。
// 用 import.meta.glob 而不是直接动态 import，避免构建期因文件缺失而解析失败。
// 注意：Vite 只识别字面量形式的 import.meta.glob(...)，不能用可选链/别名包一层，
// 所以用 typeof 守卫让 Node（tsx）下短路、同时保留 Vite 能静态分析的调用形态。
const localManifests: Record<string, SeedManifest> =
  typeof import.meta.glob === 'function'
    ? import.meta.glob('./seed-manifest.local.json', { eager: true, import: 'default' })
    : {}

export const LOCAL_MANIFEST: SeedManifest | undefined = Object.values(localManifests)[0]

export const MANIFEST_MODULES: SeedManifestModule[] =
  LOCAL_MANIFEST?.modules ?? COMMITTED_MANIFEST.modules

export function activeManifest(): SeedManifest | undefined {
  return LOCAL_MANIFEST ?? COMMITTED_MANIFEST
}

export function manifestMatchesSeed(manifest: SeedManifest | undefined): boolean {
  return Boolean(manifest && manifest.seedVersion === SEED_VERSION)
}
