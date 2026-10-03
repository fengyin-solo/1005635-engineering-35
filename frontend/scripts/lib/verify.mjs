// 一致性校验：种子 ↔ 模块元数据 ↔ 本地镜像，三处对得上才算完。
// 概览的登记总量必须等于各模块清单之和，任何一边飘了都在这里报出来。
import { loadModules, loadSeed, loadStore, overviewOf } from './common.mjs'

export function verifyConsistency({ checkStore = true } = {}) {
  const problems = []
  const modules = loadModules()
  const { rows: seedRows, version } = loadSeed()

  const moduleKeys = modules.map((meta) => meta.key)
  const seedKeys = Object.keys(seedRows)

  for (const key of moduleKeys) {
    if (!seedKeys.includes(key)) {
      problems.push(`模块 ${key} 在 modules.ts 里登记了，但种子里没有数据`)
    }
  }
  for (const key of seedKeys) {
    if (!moduleKeys.includes(key)) {
      problems.push(`种子里的 ${key} 没有在 modules.ts 里登记，概览会漏掉它`)
    }
  }

  for (const meta of modules) {
    const rows = seedRows[meta.key]
    if (!Array.isArray(rows)) {
      continue
    }
    const ids = rows.map((row) => row.id)
    if (new Set(ids).size !== ids.length) {
      problems.push(`模块 ${meta.key} 的种子 id 有重复：${ids.join(', ')}`)
    }
    rows.forEach((row, index) => {
      if (!meta.statuses.includes(row.status)) {
        problems.push(`模块 ${meta.key} 第 ${index + 1} 行状态「${row.status}」不在已登记状态里`)
      }
      if (typeof row.pending !== 'boolean' || typeof row.abnormal !== 'boolean') {
        problems.push(`模块 ${meta.key} 第 ${index + 1} 行 pending/abnormal 必须是布尔值，概览待处理数会算错`)
      }
      for (const field of meta.fields) {
        if (!(field in row)) {
          problems.push(`模块 ${meta.key} 第 ${index + 1} 行缺字段「${field}」`)
        }
      }
    })
  }

  let storeOverview = null
  if (checkStore) {
    const store = loadStore()
    if (store !== null) {
      if (store === null || typeof store !== 'object' || Array.isArray(store)) {
        problems.push('本地镜像 entries.json 不是对象结构')
      } else {
        const storeKeys = Object.keys(store)
        for (const key of storeKeys) {
          if (!moduleKeys.includes(key)) {
            problems.push(`本地镜像里混进了未登记的模块 ${key}，概览总量会对不上`)
          }
        }
        for (const key of moduleKeys) {
          if (!(key in store)) {
            problems.push(`本地镜像缺模块 ${key}，该模块清单会是空的`)
          } else if (!Array.isArray(store[key])) {
            problems.push(`本地镜像里 ${key} 不是数组`)
          } else {
            const ids = store[key].map((row) => row && row.id)
            if (new Set(ids).size !== ids.length) {
              problems.push(`本地镜像里 ${key} 有重复 id，初始化产生了重复数据`)
            }
          }
        }
        storeOverview = overviewOf(store, modules)
        const summed = storeOverview.lines.reduce((sum, line) => sum + line.created, 0)
        if (summed !== storeOverview.totals.created) {
          problems.push(`概览登记总量 ${storeOverview.totals.created} ≠ 各模块之和 ${summed}`)
        }
      }
    }
  }

  return { ok: problems.length === 0, problems, version, storeOverview, modules, seedRows }
}
