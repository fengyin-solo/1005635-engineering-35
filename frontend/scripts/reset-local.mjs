// 回收入口：把本地镜像整体复位到种子数据，各模块待处理数跟着归位。
// - 只给本地环境用：APP_ENV/NODE_ENV 显式设成非本地环境时直接拒绝
// - 幂等：每次复位带一个令牌（--token <令牌>），同一个令牌重复提交只记一次
// - 可续跑：按模块断点，中断后用同一个令牌重跑会接着复剩下的模块
// 用法：
//   node scripts/reset-local.mjs                 生成新令牌，执行一次完整复位
//   node scripts/reset-local.mjs --token abc123  用指定令牌复位；令牌已记录过就不再执行
import { randomUUID } from 'node:crypto'
import {
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

const LOCAL_ENVS = new Set(['local', 'development', 'test'])

function guardLocalEnv() {
  const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'local'
  if (!LOCAL_ENVS.has(env)) {
    console.error(`回收入口只给本地环境复位用，当前环境「${env}」不允许执行。`)
    process.exit(1)
  }
}

function parseToken(argv) {
  const index = argv.indexOf('--token')
  if (index === -1) {
    return null
  }
  const token = argv[index + 1]
  if (!token || token.startsWith('--')) {
    console.error('--token 后面要跟一个令牌值')
    process.exit(1)
  }
  return token
}

function main() {
  guardLocalEnv()

  const token = parseToken(process.argv.slice(2)) ?? `reset-${randomUUID()}`
  const { rows: seedRows, version } = loadSeed()
  const modules = loadModules()
  const journal = loadJournal()

  const existing = journal.resets.find((entry) => entry.token === token)
  if (existing && existing.finishedAt) {
    // 重复提交：只记一次，不再执行
    console.log(`复位令牌 ${token} 已在 ${existing.finishedAt} 记录过，重复提交只记一次，本次不再执行。`)
    printOverview(existing.overview)
    return
  }

  // 新复位或断点续跑：已完成的模块跳过，剩下的接着复位
  const record = existing ?? {
    token,
    seedVersion: version,
    completedModules: [],
    finishedAt: null,
    overview: null,
  }
  if (!existing) {
    journal.resets.push(record)
  }

  const store = pruneStore(loadStore() ?? {}, modules)
  saveStore(store)
  const done = new Set(record.completedModules)
  let restored = 0

  for (const meta of modules) {
    if (done.has(meta.key)) {
      continue
    }
    store[meta.key] = cloneRows(seedRows[meta.key] ?? [])
    saveStore(store)
    record.completedModules.push(meta.key)
    saveJournal(journal)
    restored += 1
    console.log(`  已复位 ${meta.name}（${meta.key}）：待处理归位`)
  }

  const overview = overviewOf(store, modules)

  // 先校验再落账：校验不过就不记 finishedAt，同一个令牌还能接着修
  const result = verifyConsistency()
  if (!result.ok) {
    saveJournal(journal)
    console.error('复位后一致性校验没过（本次未落账，修好后用同一令牌重跑即可）：')
    for (const problem of result.problems) {
      console.error(`  - ${problem}`)
    }
    process.exit(1)
  }

  record.finishedAt = new Date().toISOString()
  record.overview = overview
  saveJournal(journal)

  console.log(
    restored > 0
      ? `复位完成（令牌 ${token}）：本次复位 ${restored} 个模块，各模块待处理数已归位。`
      : `复位完成（令牌 ${token}）：没有需要复位的模块。`,
  )
  printOverview(overview)
}

main()
