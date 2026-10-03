/* eslint-disable */
// 存储层行为验证（tsx 直接跑，不经过 Vite）：旧数据换播、去重、概览对账、键归一化。
// 用最小 window/localStorage 模拟；seed-manifest.ts 在 Node 下读不到清单（glob 不存在），
// 复位令牌回退为 SEED_VERSION，与「未跑 reset-local」的全新克隆一致。
import { strict as assert } from 'node:assert'

const storeMap = new Map<string, string>()
const localStorageMock = {
  getItem: (k: string) => (storeMap.has(k) ? storeMap.get(k)! : null),
  setItem: (k: string, v: string) => void storeMap.set(k, String(v)),
  removeItem: (k: string) => void storeMap.delete(k),
  clear: () => storeMap.clear(),
}
;(globalThis as any).window = { localStorage: localStorageMock }
;(globalThis as any).localStorage = localStorageMock

const { SEED_ROWS, SEED_VERSION } = await import('../src/data/seed.ts')
const store = await import('../src/data/local-store.ts')
const service = await import('../src/api/local-service.ts')
const { MODULES } = await import('../src/data/modules.ts')

let passed = 0
function ok(name: string) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function freshImport() {
  return import(`../src/data/local-store.ts?x=${Math.random()}`)
}
function freshService() {
  return import(`../src/api/local-service.ts?y=${Math.random()}`)
}

// 场景 1：全新浏览器 → 首次播种，无复位日志
{
  storeMap.clear()
  const s = await freshImport()
  const rows = s.allRows()
  assert.equal(Object.keys(rows).length, 18)
  assert.equal(storeMap.get('district-heating:seed-meta')!.includes(SEED_VERSION), true)
  assert.deepEqual(s.resetLogs(), [])
  ok('全新浏览器：首次播种 18 个模块，不产生复位记录')
}

// 场景 2：反复初始化（再开页面）不产生重复
{
  const s = await freshImport()
  const before = storeMap.get('district-heating:entries')
  s.allRows()
  const after = storeMap.get('district-heating:entries')
  assert.equal(before, after)
  const parsed = JSON.parse(after)
  for (const key of Object.keys(SEED_ROWS)) {
    assert.equal(parsed[key].length, SEED_ROWS[key].length, `${key} 行数不变`)
  }
  ok('重复引导不重复播种，各模块行数保持 3 条')
}

// 场景 3：「上一轮」旧数据（旧版本号 + 用户改过的数据）→ 整体换播
{
  const oldRows = JSON.parse(JSON.stringify(SEED_ROWS))
  // 模拟旧轮次：换热站被人推进了状态、还手工塞了一个游离模块
  oldRows.heatstation[0].status = '运行中'
  oldRows.heatstation[0].pending = false
  oldRows.strayModule = [{ id: 1, status: 'x', pending: true, abnormal: false }]
  // 再删掉一个模块，模拟旧轮次模块不齐
  delete oldRows.hxclean
  storeMap.set(
    'district-heating:entries',
    JSON.stringify(oldRows),
  )
  storeMap.set(
    'district-heating:seed-meta',
    JSON.stringify({ seedVersion: 'olddeadbeef', resetToken: 'olddeadbeef', bootCount: 9 }),
  )
  const s = await freshImport()
  const rows = s.allRows()
  assert.equal(rows.heatstation[0].status, '待投运')
  assert.equal(rows.heatstation[0].pending, true)
  assert.equal(rows.hxclean.length, 3)
  assert.equal(rows.strayModule, undefined)
  const logs = s.resetLogs()
  assert.equal(logs.length, 1)
  assert.equal(logs[0].total, 54)
  assert.equal(logs[0].pending, 36)
  assert.equal(logs[0].abnormal, 18)
  ok('上一轮旧数据被整体换播：改动归位、缺模块补齐、游离键剔除，记录一次复位')
}

// 场景 4：概览总量 == 模块明细之和
{
  const svc = await freshService()
  const overview = svc.loadOverview()
  const sumCreated = overview.modules.reduce((a, b) => a + b.created, 0)
  const sumPending = overview.modules.reduce((a, b) => a + b.pending, 0)
  const cardTotal = overview.cards.find((c) => c.label === '登记总量')!.value
  const cardPending = overview.cards.find((c) => c.label === '待处理')!.value
  assert.equal(cardTotal, sumCreated)
  assert.equal(cardPending, sumPending)
  assert.equal(cardTotal, 54)
  assert.equal(cardPending, 36)
  assert.equal(overview.modules.length, MODULES.length)
  // 每个模块明细也对得上清单
  for (const meta of MODULES) {
    const list = svc.listEntries(meta.key)
    const row = overview.modules.find((m) => m.name === meta.name)!
    assert.equal(list.total, row.created, `${meta.name} 列表数`)
    assert.equal(list.items.filter((r: any) => r.pending).length, row.pending)
  }
  ok('概览登记总量/待处理 = 18 个模块明细之和（54 / 36）')
}

// 场景 5：页面复位 → 待处理归位；重复提交只记一次
{
  const svc = await freshService()
  // 先制造一些流转：把所有待处理推进掉
  for (const meta of MODULES) {
    const list = svc.listEntries(meta.key).items
    const action = meta.actions[meta.actions.length - 1]
    for (const row of list) {
      svc.runAction(meta.key, Number(row.id), action)
    }
  }
  const mid = svc.loadOverview()
  assert.equal(mid.cards.find((c) => c.label === '待处理')!.value, 0)
  const r1 = svc.resetAll('页面手动复位')
  assert.equal(r1.ok, true)
  assert.equal(r1.recorded, true)
  assert.equal(r1.pending, 36)
  const logsBefore = svc.getResetLogs().length
  // 再复位一次：数据已等于种子，不重复记录
  const r2 = svc.resetAll('页面手动复位')
  assert.equal(r2.ok, true)
  assert.equal(r2.recorded, false)
  const logs = svc.getResetLogs()
  assert.equal(logs.length, logsBefore)
  assert.equal(logs[0].reason, '页面手动复位')
  // 各模块待处理清单确实落位
  const after = svc.loadOverview()
  assert.equal(after.cards.find((c) => c.label === '待处理')!.value, 36)
  ok('复位后各模块待处理回到 36；重复复位只记一次（recorded=false）')
}

// 场景 6：结构缺失（只有数据没有 meta、键不全）→ 补齐且不丢用户数据
{
  storeMap.clear()
  const partial = JSON.parse(JSON.stringify(SEED_ROWS))
  partial.heatstation[0].站名 = '用户改过的站名'
  delete partial.boilerroom
  storeMap.set('district-heating:entries', JSON.stringify(partial))
  // 注意：没有 meta
  const s = await freshImport()
  const rows = s.allRows()
  assert.equal(rows.boilerroom.length, 3)
  assert.equal(rows.heatstation[0].站名, '用户改过的站名')
  assert.equal(s.resetLogs().length, 0)
  ok('只缺模块键时补齐且保留在办数据，不误记复位')
}

// 场景 7：存储损坏 → 回退种子
{
  storeMap.clear()
  storeMap.set('district-heating:entries', '{这不是JSON')
  const s = await freshImport()
  const rows = s.allRows()
  assert.equal(Object.keys(rows).length, 18)
  assert.equal(rows.heatstation.length, 3)
  ok('localStorage 损坏时安全回退种子')
}

// 场景 8：单模块 resetModule 既有做法仍然可用
{
  const svc = await freshService()
  svc.runAction('heatstation', 1, '提交投运')
  const result = svc.resetModule('heatstation')
  assert.equal(result.items[0].status, '待投运')
  assert.equal(result.total, 3)
  ok('兼容既有 resetModule（单模块复位）做法')
}

// 场景 9：reset-local 换了复位令牌 → 下次打开页面整体重播（浏览器侧闭环）
{
  storeMap.clear()
  const seeded = JSON.parse(JSON.stringify(SEED_ROWS))
  seeded.heatstation[0].status = '运行中'
  seeded.heatstation[0].pending = false
  storeMap.set('district-heating:entries', JSON.stringify(seeded))
  storeMap.set(
    'district-heating:seed-meta',
    JSON.stringify({ seedVersion: SEED_VERSION, resetToken: 'token-from-previous-reset', bootCount: 3 }),
  )
  const { activeManifest } = await import('../src/data/seed-manifest.ts')
  const expectedToken = activeManifest()?.resetToken ?? SEED_VERSION
  const s = await freshImport()
  const rows = s.allRows()
  assert.equal(rows.heatstation[0].status, '待投运')
  assert.equal(rows.heatstation[0].pending, true)
  const meta = JSON.parse(storeMap.get('district-heating:seed-meta')!)
  assert.equal(meta.resetToken, expectedToken)
  assert.equal(s.resetLogs()[0].reason, '本地复位')
  ok('reset-local 令牌变化后下次引导整体重播，待处理归位并记录「本地复位」')

  // 同一令牌再次引导：不重复重播、不重复记录
  const logsCount = s.resetLogs().length
  const s2 = await freshImport()
  s2.allRows()
  assert.equal(s2.resetLogs().length, logsCount)
  ok('复位后反复打开页面不再重复复位/重复记录')
}

// 场景 10：页面按钮复位后，刷新页面不应被误判成新复位
{
  storeMap.clear()
  const svc = await freshService()
  const r1 = svc.resetAll('页面手动复位')
  assert.equal(r1.recorded, true)
  const logsAfterButton = svc.getResetLogs().length
  // 模拟刷新：同一份 localStorage，重新引导
  const s = await freshImport()
  s.allRows()
  assert.equal(s.resetLogs().length, logsAfterButton)
  ok('页面按钮复位后刷新，不产生第二条复位记录')
}

console.log(`\n全部 ${passed} 项存储层行为验证通过`)
