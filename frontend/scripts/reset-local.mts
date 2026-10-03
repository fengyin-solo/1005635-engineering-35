// 回收入口（仅本地）：生成 src/data/seed-manifest.local.json，换掉复位令牌。
// 浏览器下次打开页面时，local-store 启动归一化发现令牌变了，就整体重播同一份种子，
// 各模块的待处理清单随之归位。重复执行只覆盖清单文件；复位记录在浏览器侧按签名去重。
import { randomUUID } from 'node:crypto'

import {
  atomicWriteJson,
  LOCAL_MANIFEST_PATH,
  buildManifest,
  verifySeed,
} from './seed-lib.mts'

const reason = process.argv[2] || '本地复位'
const check = verifySeed()
if (!check.ok) {
  console.error('种子数据自检未通过，拒绝复位：')
  for (const problem of check.problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

const manifest = buildManifest('reset-local', randomUUID(), reason)
atomicWriteJson(LOCAL_MANIFEST_PATH, manifest)

console.log(
  `本地复位清单已生成（版本 ${manifest.seedVersion}，令牌 ${manifest.resetToken.slice(0, 8)}…）`,
)
console.log(
  `刷新/重开浏览器页面后，${manifest.totals.modules} 个模块将回到种子状态：` +
    `登记 ${manifest.totals.created} 条、待处理 ${manifest.totals.pending} 条、异常 ${manifest.totals.abnormal} 条`,
)
