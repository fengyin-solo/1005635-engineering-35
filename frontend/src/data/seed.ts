import seedJson from './seed.json'
import type { EntryRow } from './types'

// 种子数据只有一份：src/data/seed.json。
// 浏览器数据层（本文件）和仓库脚本（frontend/scripts/）读的都是它，
// 起步灌数据、本地复位、页面首次打开播种，看到的都是同一份。
export const SEED_ROWS: Record<string, EntryRow[]> = seedJson as Record<string, EntryRow[]>

// 种子版本：对种子内容算 FNV-1a 哈希，种子一改版本自动变，不用手工维护。
// localStorage 里的数据版本对不上时就整份回到当前种子，避免「上一轮的数据」混进概览。
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const SEED_VERSION: string = fnv1a(JSON.stringify(seedJson))
