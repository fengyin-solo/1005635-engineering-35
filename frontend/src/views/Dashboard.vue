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
          v-if="showLocalReset"
          class="btn danger"
          type="button"
          :disabled="resetting"
          @click="resetLocal"
        >
          {{ resetting ? '复位中…' : '本地数据复位' }}
        </button>
      </div>
    </header>
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
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
      <span v-if="resetMessage" class="error-text">{{ resetMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview, resetAllModules } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const resetting = ref(false)
const resetMessage = ref('')

// 回收入口只在本地环境出现：dev server 下才有这个按钮，构建产物里没有
const showLocalReset = import.meta.env.DEV

function applyOverview(payload: OverviewResult) {
  cards.value = payload.cards
  moduleRows.value = payload.modules
}

function refresh() {
  applyOverview(loadOverview())
}

function resetLocal() {
  if (resetting.value) {
    return
  }
  if (!window.confirm('本地数据复位会把所有模块恢复到种子数据，确定继续？')) {
    return
  }
  resetting.value = true
  resetMessage.value = ''
  try {
    // 每次点击生成一个复位令牌：同一次提交重复到达只记一次，不会重复复位
    const token = `reset-${crypto.randomUUID()}`
    const { applied, overview } = resetAllModules(token)
    applyOverview(overview)
    resetMessage.value = applied
      ? '已按种子数据复位，各模块待处理数已归位'
      : '这次复位已记录过，未重复执行'
  } finally {
    resetting.value = false
  }
}

onMounted(refresh)
</script>
