<template>
  <div class="widget-content">
    <div v-if="loading" class="widget-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
    <div v-else-if="total === 0" class="widget-empty">
      <p>No conformance data yet. Start assessments to track compliance.</p>
    </div>
    <div v-else class="chart-wrapper">
      <div class="chart-container">
        <canvas ref="chartCanvas"></canvas>
        <div class="chart-center-label">
          <span class="center-value">{{ total }}</span>
          <span class="center-text">total</span>
        </div>
      </div>
      <div class="legend">
        <div v-for="item in chartData" :key="item.result" class="legend-item">
          <span class="legend-dot" :style="{ backgroundColor: item.color }"></span>
          <span class="legend-label">{{ item.label }}</span>
          <span class="legend-count">{{ item.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import client from '@/api/client'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend)

const colorMap: Record<string, string> = {
  yes: '#3fb950',
  no: '#f85149',
  na: '#909399',
  unassessed: '#484f58',
}
const labelMap: Record<string, string> = {
  yes: 'Conformant',
  no: 'Non-Conformant',
  na: 'Not Applicable',
  unassessed: 'Unassessed',
}

const loading = ref(true)
const rawData = ref<Array<{ result: string; count: number }>>([])
const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

const chartData = computed(() =>
  rawData.value.map(d => ({
    ...d,
    label: labelMap[d.result] || d.result,
    color: colorMap[d.result] || '#909399',
  }))
)

const total = computed(() => rawData.value.reduce((sum, d) => sum + d.count, 0))

onMounted(async () => {
  try {
    const { data } = await client.get('/dashboard/conformance-breakdown')
    rawData.value = data.data || []
  } catch { /* empty */ }
  loading.value = false
  if (total.value > 0) {
    await nextTick()
    drawChart()
  }
})

onBeforeUnmount(() => {
  chartInstance?.destroy()
})

function drawChart() {
  if (!chartCanvas.value) return
  chartInstance?.destroy()
  chartInstance = new Chart(chartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: chartData.value.map(d => d.label),
      datasets: [{
        data: chartData.value.map(d => d.count),
        backgroundColor: chartData.value.map(d => d.color),
        borderColor: 'transparent',
        borderWidth: 0,
        spacing: 2,
        hoverOffset: 0,
        hoverBorderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: {
        animateRotate: true,
        animateScale: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 27, 34, 0.95)',
          titleColor: '#c9d1d9',
          bodyColor: '#c9d1d9',
          borderColor: 'rgba(139, 148, 158, 0.2)',
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          boxPadding: 4,
          callbacks: {
            label: (ctx: { parsed: number; label: string }) => {
              const value = ctx.parsed
              const pct = total.value > 0 ? Math.round((value / total.value) * 100) : 0
              return ` ${ctx.label}: ${value} (${pct}%)`
            },
          },
        },
      },
    },
  })
}
</script>

<style scoped lang="scss">
.widget-content {
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
}
.widget-loading, .widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cat-text-secondary);
  text-align: center;
  p { margin: 0; font-size: 13px; }
}
.widget-loading { color: var(--cat-accent-primary); }
.chart-wrapper {
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
  align-items: center;
}
.chart-container {
  position: relative;
  flex: 1;
  min-width: 0;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
canvas {
  width: 100% !important;
  height: 100% !important;
}
.chart-center-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.center-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--cat-text-primary);
  line-height: 1;
}
.center-text {
  font-size: 11px;
  color: var(--cat-text-tertiary);
  text-transform: lowercase;
  margin-top: 2px;
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  min-width: 140px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--cat-text-secondary);
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.legend-label { flex: 1; }
.legend-count {
  color: var(--cat-text-primary);
  font-weight: 600;
}
</style>
