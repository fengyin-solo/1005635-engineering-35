<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
        <button
          v-if="isLocalDev"
          class="btn danger"
          type="button"
          :disabled="resetting"
          @click="resetLocal"
        >
          {{ resetting ? '复位中…' : '复位本地数据' }}
        </button>
      </div>
    </header>

    <p v-if="isLocalDev" class="seed-hint" :class="health.ok ? 'ok' : 'warn'">
      <span>本地环境：种子版本 {{ health.seedVersion?.slice(0, 8) }} · {{ health.message }}</span>
      <span v-if="lastReset" class="reset-hint">
        上次复位：{{ formatTime(lastReset.at) }} · {{ lastReset.reason }} · 登记 {{ lastReset.total }}
        条 / 待处理 {{ lastReset.pending }} 条{{ lastResetRecorded ? '' : '（重复提交未重复记录）' }}
      </span>
    </p>

    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span v-if="consistent">
        登记总量 {{ cards[1]?.value ?? 0 }} 条 = 各模块明细合计 {{ moduleTotal }} 条，数据保存在本机浏览器里
      </span>
      <span v-else class="error-text">概览与模块明细对不上，请重跑 ./setup.sh</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  getLastReset,
  loadOverview,
  resetAll,
  seedHealth,
} from '@/api/local-service'
import type { OverviewResult, ResetLog, ResetResult } from '@/data/types'

// 回收入口只在本地开发环境暴露（vite dev 才注入 DEV），生产构建里按钮和提示都不渲染。
const isLocalDev = import.meta.env.DEV

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const health = ref(seedHealth())
const lastReset = ref<ResetLog | null>(getLastReset())
const resetting = ref(false)
const lastResetRecorded = ref(true)

const moduleTotal = computed(() => moduleRows.value.reduce((sum, item) => sum + item.created, 0))
const consistent = computed(
  () => (cards.value.find((card) => card.label === '登记总量')?.value ?? 0) === moduleTotal.value,
)

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-CN', { hour12: false })
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  health.value = seedHealth()
  lastReset.value = getLastReset()
}

function resetLocal() {
  if (resetting.value) return
  resetting.value = true
  try {
    const result: ResetResult = resetAll('页面手动复位')
    lastResetRecorded.value = result.recorded
    window.alert(result.message)
    refresh()
  } finally {
    resetting.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.seed-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
}
.seed-hint.ok {
  background: #eef7ee;
  color: #2f6b32;
}
.seed-hint.warn {
  background: #fdf3e7;
  color: #9a5a12;
}
.reset-hint {
  opacity: 0.85;
}
.btn.danger {
  color: #b3261e;
  border-color: #d8a39f;
}
</style>
