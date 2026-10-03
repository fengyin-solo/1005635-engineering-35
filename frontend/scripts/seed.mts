// setup 的播种步骤：校验种子 → 生成 src/data/seed-manifest.json（提交进仓库的那份）。
// 幂等：resetToken 取 SEED_VERSION，种子没变时反复跑产物完全一致，不产生重复数据。
import { existsSync, rmSync } from 'node:fs'

import { SEED_VERSION } from '../src/data/seed.ts'
import {
  atomicWriteJson,
  LOCAL_MANIFEST_PATH,
  MANIFEST_PATH,
  buildManifest,
  verifySeed,
} from './seed-lib.mts'

const check = verifySeed()
if (!check.ok) {
  console.error('种子数据自检未通过，拒绝播种：')
  for (const problem of check.problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

const manifest = buildManifest('setup', SEED_VERSION)
atomicWriteJson(MANIFEST_PATH, manifest)

// setup 是「回到仓库标准种子」：清掉可能存在的本地复位覆盖，
// 避免本地那份随机令牌一直压着标准清单。
if (existsSync(LOCAL_MANIFEST_PATH)) {
  rmSync(LOCAL_MANIFEST_PATH, { force: true })
}

console.log(
  `种子清单已写入 src/data/seed-manifest.json（版本 ${manifest.seedVersion}，` +
    `${manifest.totals.modules} 个模块 / 登记 ${manifest.totals.created} 条 / ` +
    `待处理 ${manifest.totals.pending} 条 / 异常 ${manifest.totals.abnormal} 条）`,
)
