<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import client from '@/api/client'
import StateBadge from '@/components/shared/StateBadge.vue'

const { t } = useI18n()

interface Assessment {
  id: string
  title: string
  state: string
  dueDate: string
  created_at: string
  projectName: string
}

const loading = ref(false)
const assessments = ref<Assessment[]>([])

const formatDate = (dateString: string): string => {
  if (!dateString) return '-'
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return dateString
  }
}

const fetchAssessments = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/recent-assessments')
    assessments.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch recent assessments:', error)
    assessments.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchAssessments()
})
</script>

<template>
  <div class="recent-assessments-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="assessments.length === 0" class="empty-state">
      <span>{{ t('dashboard.widgets.noRecentAssessments') }}</span>
    </div>

    <el-table v-else :data="assessments" stripe size="small" :show-header="true">
      <el-table-column prop="title" label="Title" width="200" show-overflow-tooltip />
      <el-table-column prop="projectName" label="Project" width="150" show-overflow-tooltip />
      <el-table-column label="State" width="120">
        <template #default="{ row }">
          <StateBadge :state="row.state" />
        </template>
      </el-table-column>
      <el-table-column prop="dueDate" label="Due Date" width="140">
        <template #default="{ row }">
          {{ formatDate(row.dueDate) }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped lang="scss">
.recent-assessments-widget {
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

:deep(.el-table) {
  background: transparent;
  color: var(--cat-text-primary, #24292f);

  .el-table__header {
    background: var(--cat-bg-secondary, #f6f8fa);
  }

  .el-table__body tr:hover > td {
    background: var(--cat-bg-secondary, #f6f8fa);
  }

  th {
    background: var(--cat-bg-secondary, #f6f8fa);
    color: var(--cat-text-primary, #24292f);
  }

  td {
    color: var(--cat-text-primary, #24292f);
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
