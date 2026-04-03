<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import client from '@/api/client'

interface DueDate {
  id: string
  title: string
  dueDate: string
  state: string
  projectName: string
  daysUntilDue: number
}

const loading = ref(false)
const items = ref<DueDate[]>([])

const getDaysUntilBadgeType = (days: number): 'danger' | 'warning' | 'info' => {
  if (days <= 7) return 'danger'
  if (days <= 14) return 'warning'
  return 'info'
}

const formatDate = (dateString: string): string => {
  if (!dateString) return '-'
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return dateString
  }
}

const fetchDueDates = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/upcoming-due-dates')
    items.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch upcoming due dates:', error)
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchDueDates()
})
</script>

<template>
  <div class="upcoming-due-dates-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="items.length === 0" class="empty-state">
      <span>All assessments are on schedule.</span>
    </div>

    <div v-else class="due-list">
      <div v-for="item in items" :key="item.id" class="due-item">
        <div class="item-content">
          <div class="item-title">{{ item.title }}</div>
          <div class="item-meta">{{ item.projectName }} · {{ formatDate(item.dueDate) }}</div>
        </div>
        <el-badge
          :value="`${item.daysUntilDue}d`"
          :type="getDaysUntilBadgeType(item.daysUntilDue)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.upcoming-due-dates-widget {
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

.due-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.due-item {
  padding: 12px;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
  border: 1px solid var(--cat-border-default, #d0d7de);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-weight: 600;
  color: var(--cat-text-primary, #24292f);
  font-size: 14px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
