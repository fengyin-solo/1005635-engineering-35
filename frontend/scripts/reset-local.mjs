#!/usr/bin/env node
// 回收入口，仅供本地开发复位用：换一份复位令牌清单，页面下次打开整体重播种子。
// 生产构建 / CI 环境直接拒绝，避免把本地复位清单带进发布流程。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')

const forbidEnvs = ['production', 'prod', 'ci', 'test']
const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase()
const reasonArg = process.argv[2]

if (forbidEnvs.includes(nodeEnv)) {
  console.error(`[reset-local] 复位只允许在本地环境执行（当前 NODE_ENV=${process.env.NODE_ENV}）`)
  process.exit(1)
}
if (process.env.CI === 'true') {
  console.error('[reset-local] 检测到 CI 环境，拒绝执行本地复位')
  process.exit(1)
}

const tsxInstalled = existsSync(
  resolve(frontendDir, 'node_modules/tsx/package.json'),
)
if (!tsxInstalled) {
  console.error('[reset-local] 依赖还没装齐（缺少 tsx）。请先在仓库根目录执行 ./setup.sh 完成起步。')
  process.exit(1)
}

const args = ['--import', 'tsx', resolve(frontendDir, 'scripts/reset-local.mts')]
if (reasonArg) args.push(reasonArg)
const result = spawnSync(process.execPath, args, {
  cwd: frontendDir,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
