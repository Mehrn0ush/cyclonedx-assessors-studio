<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import client from '@/api/client'

interface ComplianceStandard {
  standardId: string
  standardName: string
  version: string
  totalRequirements: number
  assessedRequirements: number
  coveragePercent: number
}

const loading = ref(false)
const standards = ref<ComplianceStandard[]>([])

const getProgressColor = (percent: number): string => {
  if (percent >= 80) {
    return '#3fb950'
  } else if (percent >= 50) {
    return '#d29922'
  } else {
    return '#f85149'
  }
}

const fetchCoverage = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/compliance-coverage')
    standards.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch compliance coverage:', error)
    standards.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchCoverage()
})
</script>

<template>
  <div class="compliance-coverage-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="standards.length === 0" class="empty-state">
      <span>No standards available</span>
    </div>

    <div v-else class="standards-list">
      <div v-for="standard in standards" :key="standard.standardId" class="standard-item">
        <div class="standard-header">
          <div class="standard-name">{{ standard.standardName }}</div>
          <div class="standard-version">v{{ standard.version }}</div>
        </div>
        <div class="standard-progress">
          <el-progress
            :percentage="standard.coveragePercent"
            :color="getProgressColor(standard.coveragePercent)"
            :show-text="true"
          />
        </div>
        <div class="standard-detail">
          {{ standard.assessedRequirements }} / {{ standard.totalRequirements }} requirements assessed
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.compliance-coverage-widget {
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
}

.standards-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.standard-item {
  padding: 12px;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
  border: 1px solid var(--cat-border-default, #d0d7de);
}

.standard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.standard-name {
  font-weight: 600;
  color: var(--cat-text-primary, #24292f);
  font-size: 14px;
}

.standard-version {
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
}

.standard-progress {
  margin-bottom: 8px;
}

.standard-detail {
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
  text-align: right;
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
