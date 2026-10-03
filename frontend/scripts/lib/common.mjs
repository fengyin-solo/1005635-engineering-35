// 脚本侧共享库：种子来源、模块元数据、本地文件镜像、断点日志。
// 浏览器数据层（src/data/local-store.ts）和这里的脚本读的是同一份种子：src/data/seed.json。
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const PATHS = {
  seedJson: join(FRONTEND_ROOT, 'src', 'data', 'seed.json'),
  modulesTs: join(FRONTEND_ROOT, 'src', 'data', 'modules.ts'),
  dataDir: join(FRONTEND_ROOT, '.local-data'),
  get storeFile() {
    return join(this.dataDir, 'entries.json')
  },
  get journalFile() {
    return join(this.dataDir, 'journal.json')
  },
}

// 与 src/data/seed.ts 里的 FNV-1a 保持一致：同一份种子算出同一个版本号
function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function loadSeed() {
  const rows = JSON.parse(readFileSync(PATHS.seedJson, 'utf8'))
  return { rows, version: fnv1a(JSON.stringify(rows)) }
}

// modules.ts 是生成代码，MODULES 数组本身是纯数据，直接取出来用
export function loadModules() {
  const source = readFileSync(PATHS.modulesTs, 'utf8')
  const match = source.match(/export const MODULES[^=]*=\s*(\[[\s\S]*?\n\])/)
  if (!match) {
    throw new Error('modules.ts 结构变了，没解析到 MODULES 数组，请同步更新 scripts/lib/common.mjs')
  }
  const modules = new Function(`return ${match[1]}`)()
  if (!Array.isArray(modules) || modules.some((item) => !item.key || !Array.isArray(item.statuses))) {
    throw new Error('modules.ts 解析结果不完整，请同步更新 scripts/lib/common.mjs')
  }
  return modules
}

function readJson(file, fallback) {
  if (!existsSync(file)) {
    return fallback
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

// 先写临时文件再改名：跑到一半被掐断也不会留下半个 JSON
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tmp, file)
}

// 本地文件镜像：结构和浏览器 localStorage 的 district-heating:entries 完全一致
export function loadStore() {
  return readJson(PATHS.storeFile, null)
}

export function saveStore(store) {
  writeJsonAtomic(PATHS.storeFile, store)
}

export function loadJournal() {
  return readJson(PATHS.journalFile, { seed: null, resets: [] })
}

export function saveJournal(journal) {
  writeJsonAtomic(PATHS.journalFile, journal)
}

export function cloneRows(rows) {
  return JSON.parse(JSON.stringify(rows))
}

// 剃掉没登记的模块：和浏览器 readStorage 的 normalize 一个口径，概览总量才不会多出幽灵模块
export function pruneStore(store, modules) {
  const registered = new Set(modules.map((meta) => meta.key))
  const pruned = {}
  for (const meta of modules) {
    if (Array.isArray(store[meta.key])) {
      pruned[meta.key] = store[meta.key]
    }
  }
  return pruned
}

// 概览口径：与 src/api/local-service.ts 的 loadOverview 同一套算法
export function overviewOf(store, modules) {
  const lines = modules.map((meta) => {
    const entries = Array.isArray(store[meta.key]) ? store[meta.key] : []
    return {
      key: meta.key,
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row && row.pending === true).length,
      abnormal: entries.filter((row) => row && row.abnormal === true).length,
    }
  })
  return {
    lines,
    totals: {
      modules: lines.length,
      created: lines.reduce((sum, line) => sum + line.created, 0),
      pending: lines.reduce((sum, line) => sum + line.pending, 0),
      abnormal: lines.reduce((sum, line) => sum + line.abnormal, 0),
    },
  }
}

export function printOverview(overview) {
  console.log('  模块           登记   待处理   异常')
  for (const line of overview.lines) {
    console.log(
      `  ${line.name.padEnd(12, '　')} ${String(line.created).padStart(4)}   ${String(line.pending).padStart(4)}   ${String(line.abnormal).padStart(4)}`,
    )
  }
  const { totals } = overview
  console.log(`  合计：业务模块 ${totals.modules}，登记总量 ${totals.created}，待处理 ${totals.pending}，异常量 ${totals.abnormal}`)
}
