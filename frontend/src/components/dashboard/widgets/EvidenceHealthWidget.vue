<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import client from '@/api/client'
import StateBadge from '@/components/shared/StateBadge.vue'

const { t } = useI18n()

interface EvidenceItem {
  id: string
  name: string
  expiresOn: string
  state: string
}

interface EvidenceData {
  data: Array<{
    state: string
    count: number
  }>
  expiringSoon: EvidenceItem[]
}

const loading = ref(false)
const evidenceData = ref<EvidenceData>({
  data: [],
  expiringSoon: []
})

const stateItems = computed(() => {
  return evidenceData.value.data || []
})

const expiringItems = computed(() => {
  return evidenceData.value.expiringSoon || []
})

const formatDate = (dateString: string): string => {
  if (!dateString) return '-'
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return dateString
  }
}

const fetchHealth = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/evidence-health')
    evidenceData.value = response.data || { data: [], expiringSoon: [] }
  } catch (error) {
    console.error('Failed to fetch evidence health:', error)
    evidenceData.value = { data: [], expiringSoon: [] }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchHealth()
})
</script>

<template>
  <div class="evidence-health-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="stateItems.length === 0 && expiringItems.length === 0" class="empty-state">
      <span>{{ t('dashboard.widgets.noEvidenceDataAvailable') }}</span>
    </div>

    <div v-else class="evidence-container">
      <div class="evidence-grid">
        <div v-for="item in stateItems" :key="item.state" class="evidence-stat">
          <div class="stat-label">
            <StateBadge :state="item.state" />
          </div>
          <div class="stat-value">{{ item.count }}</div>
        </div>
      </div>

      <div v-if="expiringItems.length > 0" class="expiring-section">
        <div class="section-title">{{ t('dashboard.widgets.expiringWithin30Days') }}</div>
        <div class="expiring-list">
          <div v-for="item in expiringItems" :key="item.id" class="expiring-item">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-date">{{ formatDate(item.expiresOn) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.evidence-health-widget {
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

.evidence-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.evidence-stat {
  padding: 12px;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
  border: 1px solid var(--cat-border-default, #d0d7de);
  text-align: center;
}

.stat-label {
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--cat-text-primary, #24292f);
}

.expiring-section {
  padding: 12px;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
  border: 1px solid var(--cat-border-default, #d0d7de);
}

.section-title {
  font-weight: 600;
  color: var(--cat-text-primary, #24292f);
  margin-bottom: 12px;
  font-size: 13px;
}

.expiring-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 150px;
  overflow-y: auto;
}

.expiring-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--cat-border-default, #d0d7de);
  font-size: 12px;

  &:last-child {
    border-bottom: none;
  }
}

.item-name {
  color: var(--cat-text-primary, #24292f);
  flex: 1;
}

.item-date {
  color: var(--cat-text-secondary, #57606a);
  white-space: nowrap;
  margin-left: 8px;
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
