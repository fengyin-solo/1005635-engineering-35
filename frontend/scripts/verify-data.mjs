// 一致性检查：种子 ↔ 模块元数据 ↔ 本地镜像，概览总量必须等于各模块之和。
// 任何时候都可以单独跑：node scripts/verify-data.mjs
import { overviewOf, printOverview, loadModules, loadStore } from './lib/common.mjs'
import { verifyConsistency } from './lib/verify.mjs'

const result = verifyConsistency()

if (!result.ok) {
  console.error('一致性检查没过：')
  for (const problem of result.problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log(`种子版本 ${result.version}，模块 ${result.modules.length} 个，全部对得上。`)
const store = loadStore()
if (store) {
  printOverview(overviewOf(store, loadModules()))
} else {
  console.log('本地镜像还没生成，先跑 npm run seed:data。')
}
