<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading, CircleCheckFilled } from '@element-plus/icons-vue'
import client from '@/api/client'

const { t } = useI18n()

interface RiskInsight {
  type: 'blind_spot' | 'overdue' | 'gap' | 'expiring'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
}

const loading = ref(false)
const insights = ref<RiskInsight[]>([])

const severityColors: Record<string, string> = {
  critical: '#f85149',
  high: '#d29922',
  medium: '#58a6ff',
  low: '#909399'
}

const getSeverityTagType = (severity: string): 'danger' | 'warning' | 'info' | 'success' => {
  const typeMap = {
    critical: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'success'
  }
  return (typeMap[severity as keyof typeof typeMap] || 'info') as 'danger' | 'warning' | 'info' | 'success'
}

const fetchInsights = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/risk-insights')
    insights.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch risk insights:', error)
    insights.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchInsights()
})
</script>

<template>
  <div class="risk-insights-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="insights.length === 0" class="empty-state">
      <el-icon :size="32" class="check-icon">
        <CircleCheckFilled />
      </el-icon>
      <span>{{ t('dashboard.widgets.noActiveRisks') }}</span>
    </div>

    <div v-else class="insights-list">
      <div
        v-for="(insight, idx) in insights"
        :key="idx"
        class="insight-card"
        :style="{ borderLeftColor: severityColors[insight.severity] }"
      >
        <div class="insight-header">
          <el-tag :type="getSeverityTagType(insight.severity)">
            {{ insight.severity }}
          </el-tag>
          <el-tag>{{ insight.type }}</el-tag>
        </div>
        <div class="insight-title">{{ insight.title }}</div>
        <div class="insight-detail">{{ insight.detail }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.risk-insights-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-direction: column;
  gap: 8px;

  .spinner {
    animation: spin 2s linear infinite;
    color: var(--cat-primary-500, #0052cc);
  }

  .check-icon {
    color: #3fb950;
  }
}

.insights-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.insight-card {
  padding: 12px;
  border-left: 4px solid;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
}

.insight-header {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.insight-title {
  font-weight: 600;
  color: var(--cat-text-primary, #24292f);
  margin-bottom: 4px;
  font-size: 14px;
}

.insight-detail {
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
  line-height: 1.5;
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
