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

const stateColors: Record<string, string> = {
  new: '#58a6ff',
  pending: '#d29922',
  in_progress: '#3fb950',
  on_hold: '#909399',
  cancelled: '#f85149',
  complete: '#2ea043'
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

    const labels = data.map((item: PipelineData) => stateLabels[item.state] || item.state)
    const counts = data.map((item: PipelineData) => item.count)
    const colors = data.map((item: PipelineData) => stateColors[item.state] || '#58a6ff')

    renderChart(labels, counts, colors)
  } catch (error) {
    console.error('Failed to fetch assessment distribution:', error)
  } finally {
    loading.value = false
  }
}

const renderChart = (labels: string[], counts: number[], colors: string[]) => {
  if (!chartContainer.value) return

  if (chartInstance) {
    chartInstance.destroy()
  }

  const ctx = chartContainer.value.getContext('2d')
  if (!ctx) return

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Assessments',
          data: counts,
          backgroundColor: colors,
          borderRadius: 4,
          borderSkipped: false
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
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: '#8b949e'
          },
          grid: {
            color: 'rgba(139,148,158,0.1)'
          }
        },
        y: {
          ticks: {
            color: '#c9d1d9'
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
