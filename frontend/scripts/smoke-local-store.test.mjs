// 浏览器侧数据层冒烟测试：用 localStorage shim 模拟浏览器。
// 通过 npm run test:smoke 触发（先 esbuild 打包再跑）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 与 src/data/seed.ts 同款 FNV-1a，直接从种子文件算期望版本
function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
const EXPECT_SEED_VERSION = fnv1a(
  JSON.stringify(JSON.parse(readFileSync('src/data/seed.json', 'utf8'))),
)

const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
}

// 先布置「上一轮的旧数据」：版本对不上、混着幽灵模块、流转过的状态
storage.set('district-heating:meta', JSON.stringify({ seedVersion: 'old-round' }))
storage.set(
  'district-heating:entries',
  JSON.stringify({
    heatstation: [{ id: 1, status: '已移交', pending: false, abnormal: false }],
    ghostmodule: [{ id: 1, status: 'x', pending: true, abnormal: false }],
  }),
)

const { SEED_VERSION } = await import('@/data/seed.ts')
const { listRows, resetAllRows, storageKey } = await import('@/data/local-store.ts')
const { loadOverview, resetAllModules, runAction } = await import('@/api/local-service.ts')

// 1) 与脚本侧同一个种子版本（两处读的是同一份种子数据）
assert.equal(SEED_VERSION, EXPECT_SEED_VERSION, '浏览器与脚本的种子版本必须一致')

// 2) 打开页面：旧版本数据自动回到当前种子，幽灵模块剔除，缺模块补齐
let overview = loadOverview()
const sumCreated = overview.modules.reduce((s, m) => s + m.created, 0)
assert.equal(overview.cards.find((c) => c.label === '登记总量').value, sumCreated, '概览总量必须等于各模块之和')
assert.equal(sumCreated, 54)
assert.equal(overview.cards.find((c) => c.label === '待处理').value, 36)
const persisted = JSON.parse(storage.get(storageKey()))
assert.equal('ghostmodule' in persisted, false, '幽灵模块要被剔除')
assert.equal(Object.keys(persisted).length, 18, '缺模块要用种子补齐')
assert.equal(JSON.parse(storage.get('district-heating:meta')).seedVersion, SEED_VERSION)

// 3) 状态流转：总量不变，待处理数跟着走
const act = runAction('heatstation', 1, '办理移交')
assert.equal(act.ok, true)
overview = loadOverview()
assert.equal(overview.cards.find((c) => c.label === '待处理').value, 35)
assert.equal(overview.cards.find((c) => c.label === '登记总量').value, 54)

// 4) 本地复位：待处理数归位；同一令牌重复提交只记一次
const first = resetAllModules('tok-1')
assert.equal(first.applied, true)
assert.equal(first.overview.cards.find((c) => c.label === '待处理').value, 36, '复位后各模块待处理归位')
const dup = resetAllModules('tok-1')
assert.equal(dup.applied, false, '同一令牌重复提交不再执行')
const resetLog = JSON.parse(storage.get('district-heating:reset-log'))
assert.equal(resetLog.filter((e) => e.token === 'tok-1').length, 1, '复位日志只记一次')

// 5) 复位结果落到各模块清单：每个模块回到种子行数
assert.equal(listRows('heatstation').length, 3)
assert.equal(resetAllRows('tok-1').applied, false, '数据层同一令牌也只记一次')

console.log('浏览器侧数据层冒烟测试全部通过')
