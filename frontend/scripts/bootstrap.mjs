// 起步一条命令：装依赖 + 灌种子数据。
// - 有 package-lock.json 用 npm ci 按锁定版本装
// - 锁文件缺失（依赖版本没补录过）先退回 npm install，把版本补录进锁文件
// - 装完自动灌种子数据并做一致性校验
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args) {
  const result = spawnSync(command, args, { cwd: FRONTEND_ROOT, stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const hasLockfile = existsSync(join(FRONTEND_ROOT, 'package-lock.json'))
if (hasLockfile) {
  console.log('检测到 package-lock.json，按锁定版本安装（npm ci）…')
  run('npm', ['ci'])
} else {
  console.log('没有 package-lock.json，依赖版本缺失，先退回 npm install 补录锁文件…')
  run('npm', ['install'])
}

console.log('依赖就绪，开始灌种子数据…')
run('node', ['scripts/seed-data.mjs'])
console.log('起步完成：npm run dev 起服务，浏览器打开终端里打印的地址即可。')
