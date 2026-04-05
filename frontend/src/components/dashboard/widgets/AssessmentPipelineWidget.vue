<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import Chart from 'chart.js/auto'
import client from '@/api/client'

interface PipelineData {
  state: string
  count: number
}

const loading = ref(false)
const chartContainer = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

/**
 * Each state gets a gradient that flows left to right (darker to brighter),
 * matching the conformance progress bar style.
 */
const stateGradients: Record<string, [string, string]> = {
  new: ['#3a6fb5', '#58a6ff'],
  pending: ['#9e6a03', '#d29922'],
  in_progress: ['#238636', '#3fb950'],
  on_hold: ['#606872', '#909399'],
  cancelled: ['#da3633', '#f85149'],
  complete: ['#1a7f37', '#2ea043'],
}

const stateLabels: Record<string, string> = {
  new: 'New',
  pending: 'Pending',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  complete: 'Complete'
}

const fetchData = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/assessment-distribution')
    const data = response.data.data || []

    // Filter out states with zero counts for a cleaner chart
    const nonZero = data.filter((item: PipelineData) => item.count > 0)
    const labels = nonZero.map((item: PipelineData) => stateLabels[item.state] || item.state)
    const counts = nonZero.map((item: PipelineData) => item.count)
    const states = nonZero.map((item: PipelineData) => item.state)

    renderChart(labels, counts, states)
  } catch (error) {
    console.error('Failed to fetch assessment distribution:', error)
  } finally {
    loading.value = false
  }
}

const renderChart = (labels: string[], counts: number[], states: string[]) => {
  if (!chartContainer.value) return

  if (chartInstance) {
    chartInstance.destroy()
  }

  const ctx = chartContainer.value.getContext('2d')
  if (!ctx) return

  // Build horizontal gradients for each bar
  const barGradients = states.map((state) => {
    const grad = ctx.createLinearGradient(0, 0, chartContainer.value!.width, 0)
    const [start, end] = stateGradients[state] || ['#3a6fb5', '#58a6ff']
    grad.addColorStop(0, start)
    grad.addColorStop(1, end)
    return grad
  })

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Assessments',
          data: counts,
          backgroundColor: barGradients,
          borderRadius: 4,
          borderSkipped: false,
          barThickness: 18,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(22, 27, 34, 0.95)',
          titleColor: '#c9d1d9',
          bodyColor: '#c9d1d9',
          borderColor: 'rgba(139, 148, 158, 0.2)',
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: '#8b949e',
            stepSize: 1,
          },
          grid: {
            color: 'rgba(139,148,158,0.08)',
          }
        },
        y: {
          ticks: {
            color: '#c9d1d9',
            font: {
              size: 12,
            },
          },
          grid: {
            display: false
          }
        }
      }
    }
  })
}

onMounted(() => {
  fetchData()
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<template>
  <div class="assessment-pipeline-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>
    <canvas v-else ref="chartContainer" height="200"></canvas>
  </div>
</template>

<style scoped lang="scss">
.assessment-pipeline-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: 8px;

  canvas {
    width: 100% !important;
  }
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .spinner {
    animation: spin 2s linear infinite;
    color: var(--cat-primary-500, #0052cc);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
