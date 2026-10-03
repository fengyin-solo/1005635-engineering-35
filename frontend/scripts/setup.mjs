#!/usr/bin/env node
// 一条命令完成起步：拉齐依赖 + 灌好种子数据。
//   1. 依赖缺失/不完整时先退回补录（npm install，幂等）
//   2. 依赖就位后用 tsx 执行 scripts/seed.mts，生成种子清单
// 跑到一半断了：.setup-state.json 记录已完成的步骤，重跑只补未完成的步骤。
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')
const statePath = resolve(frontendDir, '.setup-state.json')

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

function log(message) {
  console.log(`[setup] ${message}`)
}

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return { runId: randomUUID(), steps: {} }
  }
}

function saveState(state) {
  const tmp = `${statePath}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, statePath)
}

function declaredDeps() {
  const pkg = JSON.parse(readFileSync(resolve(frontendDir, 'package.json'), 'utf8'))
  return { ...pkg.dependencies, ...pkg.devDependencies }
}

// 依赖是否齐：node_modules 在、package.json 里声明的每个包目录都在。
// 用包目录判断而不是 require.resolve，兼容 @types/* 这类没有入口文件的包。
function depsComplete() {
  const nodeModules = resolve(frontendDir, 'node_modules')
  if (!existsSync(nodeModules)) {
    return { ok: false, reason: 'node_modules 不存在' }
  }
  for (const name of Object.keys(declaredDeps())) {
    if (!existsSync(resolve(nodeModules, name, 'package.json'))) {
      return { ok: false, reason: `缺少依赖 ${name}` }
    }
  }
  return { ok: true }
}

function main() {
  if (!existsSync(resolve(frontendDir, 'package.json'))) {
    console.error(`[setup] 找不到 ${resolve(frontendDir, 'package.json')}，请在仓库里运行本脚本`)
    process.exit(1)
  }
  if (!existsSync(dirname(statePath))) {
    mkdirSync(dirname(statePath), { recursive: true })
  }
  const state = loadState()
  state.updatedAt = new Date().toISOString()

  // 步骤 1：依赖。已安装且完整就跳过；缺什么都先退回补录。
  if (state.steps.deps === 'done' && depsComplete().ok) {
    log('依赖已安装且完整，跳过')
  } else {
    const check = depsComplete()
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    // 有 lockfile 且 node_modules 整个不在（全新克隆）→ npm ci 严格按锁文件装，版本不会缺；
    // 其余情况（装过但缺包/跨平台）→ npm install 增量补齐。
    const hasLock = existsSync(resolve(frontendDir, 'package-lock.json'))
    const freshClone = !existsSync(resolve(frontendDir, 'node_modules'))
    if (!check.ok) {
      log(`${check.reason}，先${hasLock && freshClone ? '按 package-lock.json（npm ci）' : '执行 npm install'}补录依赖…`)
    } else {
      log('执行 npm install 对齐依赖版本…')
    }
    const installArgs = hasLock && freshClone ? ['ci'] : ['install']
    const code = run(npmCmd, installArgs, frontendDir)
    if (code !== 0) {
      state.steps.deps = 'failed'
      saveState(state)
      console.error('[setup] 依赖安装失败，网络恢复后重跑本命令即可续装')
      process.exit(code)
    }
    const recheck = depsComplete()
    if (!recheck.ok) {
      state.steps.deps = 'failed'
      saveState(state)
      console.error(`[setup] npm install 完成但仍不完整：${recheck.reason}`)
      process.exit(1)
    }
    state.steps.deps = 'done'
    saveState(state)
    log('依赖已就位')
  }

  // 步骤 2：播种。种子没变时产物幂等（resetToken 取种子版本，见 seed.mts）。
  if (state.steps.seed === 'done' && existsSync(resolve(frontendDir, 'src/data/seed-manifest.json'))) {
    log('种子清单已存在，重新校验并刷新一遍（幂等，不产生重复数据）')
  }
  const seedCode = run(
    process.execPath,
    ['--import', 'tsx', resolve(frontendDir, 'scripts/seed.mts')],
    frontendDir,
  )
  if (seedCode !== 0) {
    state.steps.seed = 'failed'
    saveState(state)
    console.error('[setup] 种子数据写入失败，修好后重跑本命令即可续跑（依赖步骤不会重装）')
    process.exit(seedCode)
  }
  state.steps.seed = 'done'
  state.completedAt = new Date().toISOString()
  saveState(state)

  log('起步完成：依赖已齐、种子已灌好。现在可以执行 npm run dev 启动开发服务器')
}

main()
