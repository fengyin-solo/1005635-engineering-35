// 灌种子数据：把 src/data/seed.json 灌进本地镜像 .local-data/entries.json。
// - 幂等：按模块整份替换，反复跑不会产生重复数据
// - 可续跑：每灌完一个模块就在 journal 里记一笔，断了重跑只补没灌的
// - 跑完自动过一遍一致性校验，概览总量对不上就直接失败
import {
  PATHS,
  cloneRows,
  loadJournal,
  loadModules,
  loadSeed,
  loadStore,
  overviewOf,
  printOverview,
  pruneStore,
  saveJournal,
  saveStore,
} from './lib/common.mjs'
import { verifyConsistency } from './lib/verify.mjs'

function main() {
  const { rows: seedRows, version } = loadSeed()
  const modules = loadModules()
  const journal = loadJournal()

  // 种子换了一版就重来：上一轮的进度不作数
  if (!journal.seed || journal.seed.seedVersion !== version) {
    journal.seed = { seedVersion: version, completedModules: [], finishedAt: null }
  }
  const progress = journal.seed

  const store = pruneStore(loadStore() ?? {}, modules)
  saveStore(store)
  const done = new Set(progress.completedModules)
  let seeded = 0
  let skipped = 0

  for (const meta of modules) {
    const want = seedRows[meta.key] ?? []
    const current = store[meta.key]
    const already = done.has(meta.key) && JSON.stringify(current) === JSON.stringify(want)
    if (already) {
      skipped += 1
      continue
    }
    store[meta.key] = cloneRows(want)
    saveStore(store)
    if (!done.has(meta.key)) {
      progress.completedModules.push(meta.key)
    }
    saveJournal(journal)
    seeded += 1
    console.log(`  已灌入 ${meta.name}（${meta.key}）：${want.length} 条`)
  }

  progress.finishedAt = new Date().toISOString()
  saveJournal(journal)

  console.log(
    skipped > 0
      ? `本次新灌 ${seeded} 个模块，${skipped} 个模块之前已灌好（断点续跑跳过）`
      : `本次灌入 ${seeded} 个模块`,
  )

  const result = verifyConsistency()
  if (!result.ok) {
    console.error('一致性校验没过：')
    for (const problem of result.problems) {
      console.error(`  - ${problem}`)
    }
    process.exit(1)
  }

  console.log(`种子版本 ${version}，镜像在 ${PATHS.storeFile}`)
  printOverview(overviewOf(store, modules))
  console.log('概览登记总量与各模块明细一致。')
}

main()
