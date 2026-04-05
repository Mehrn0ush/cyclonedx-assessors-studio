<template>
  <div class="evidence-container">
    <PageHeader :title="t('evidence.title')">
      <template #actions>
        <el-button type="primary" @click="showCreateDialog = true">{{ t('evidence.newEvidence') }}</el-button>
      </template>
    </PageHeader>

    <div class="evidence-content">
      <div class="filter-bar" role="search">
        <el-select v-model="filterState" :placeholder="t('evidence.filterByState')" style="width: 150px" aria-label="Filter by state">
          <el-option :label="t('evidence.allStates')" value=""></el-option>
          <el-option :label="t('states.in_review')" value="in_review"></el-option>
          <el-option :label="t('states.in_progress')" value="in_progress"></el-option>
          <el-option :label="t('states.claimed')" value="claimed"></el-option>
          <el-option :label="t('states.expired')" value="expired"></el-option>
        </el-select>

        <el-input v-model="searchText" :placeholder="t('evidence.searchPlaceholder')" style="width: 250px" clearable aria-label="Search evidence" />
      </div>

      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>
      <el-alert v-else-if="error" type="error" show-icon :closable="false">{{ error }}</el-alert>
      <div v-else-if="filteredEvidence.length === 0" class="empty-state-contextual">
        <el-icon :size="48"><Collection /></el-icon>
        <h3>{{ t('evidence.noItems') }}</h3>
        <p>{{ t('evidence.noItemsDescription') }}</p>
        <el-button type="primary" @click="showCreateDialog = true">{{ t('evidence.newEvidence') }}</el-button>
      </div>
      <div v-else class="content">
        <el-table :data="filteredEvidence" stripe border @row-click="navigateToEvidence" role="grid" aria-label="Evidence table">
          <el-table-column prop="name" :label="t('evidence.name')" min-width="250" sortable></el-table-column>
          <el-table-column :label="t('evidence.state')" min-width="120">
            <template #default="{ row }">
              <StateBadge :state="row.state" />
            </template>
          </el-table-column>
          <el-table-column :label="t('evidence.author')" min-width="120">
            <template #default="{ row }">
              {{ row.authorName || row.authorId }}
            </template>
          </el-table-column>
          <el-table-column :label="t('evidence.reviewer')" min-width="120">
            <template #default="{ row }">
              {{ row.reviewerName || row.reviewerId }}
            </template>
          </el-table-column>
          <el-table-column :label="t('evidence.created')" min-width="120">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('evidence.expires')" min-width="120">
            <template #default="{ row }">
              {{ formatDate(row.expiresOn) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.counter')">
            <template #header>
              <span>{{ t('common.counter') }} <HelpTip :content="t('evidence.counterEvidenceDescription')" /></span>
            </template>
            <template #default="{ row }">
              <el-tag v-if="row.isCounterEvidence" type="danger">{{ t('common.counter') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="'Linked Assessments'" min-width="140">
            <template #default="{ row }">
              <el-badge v-if="row.assessmentCount > 0" :value="row.assessmentCount" type="primary" />
              <span v-else style="color: var(--cat-text-tertiary);">0</span>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalEvidence"
          layout="total, prev, pager, next"
          @current-change="currentPage = 1"
        />
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" :title="t('evidence.newEvidence')" width="500px">
      <el-form :model="createForm" label-width="140px">
        <el-form-item :label="t('evidence.name')" required>
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="createForm.description" type="textarea" />
        </el-form-item>
        <el-form-item :label="t('evidence.classification')">
          <el-input v-model="createForm.classification" />
        </el-form-item>
        <el-form-item :label="t('evidence.expires')">
          <el-date-picker v-model="createForm.expiresOn" type="date" />
        </el-form-item>
        <el-form-item :label="t('common.counter')">
          <el-checkbox v-model="createForm.isCounterEvidence" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Loading, Collection } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()

const router = useRouter()

const filterState = ref('')
const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const loading = ref(false)
const error = ref('')
const saving = ref(false)
const showCreateDialog = ref(false)

const evidence = ref<any[]>([])

const createForm = ref({
  name: '',
  description: '',
  classification: '',
  expiresOn: null as any,
  isCounterEvidence: false
})

onMounted(() => {
  fetchEvidence()
})

const fetchEvidence = async () => {
  loading.value = true
  error.value = ''
  try {
    const params: any = {}
    if (filterState.value) {
      params.state = filterState.value
    }

    const response = await axios.get('/api/v1/evidence', { params })
    evidence.value = response.data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.message || t('common.error')
    console.error('Failed to fetch evidence:', err)
  } finally {
    loading.value = false
  }
}

const filteredEvidence = computed(() => {
  const filtered = evidence.value.filter(item => {
    const matchesSearch = !searchText.value ||
      item.name.toLowerCase().includes(searchText.value.toLowerCase())
    return matchesSearch
  })
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

const totalEvidence = computed(() => {
  return evidence.value.filter(item => {
    const matchesSearch = !searchText.value ||
      item.name.toLowerCase().includes(searchText.value.toLowerCase())
    return matchesSearch
  }).length
})

const handleCreate = async () => {
  if (!createForm.value.name) {
    ElMessage.error('Name is required')
    return
  }

  saving.value = true
  try {
    const payload = {
      name: createForm.value.name,
      description: createForm.value.description,
      classification: createForm.value.classification || null,
      expiresOn: createForm.value.expiresOn ? createForm.value.expiresOn.toISOString().split('T')[0] : null,
      isCounterEvidence: createForm.value.isCounterEvidence
    }

    await axios.post('/api/v1/evidence', payload)
    ElMessage.success('Evidence created successfully')
    showCreateDialog.value = false
    createForm.value = { name: '', description: '', classification: '', expiresOn: null, isCounterEvidence: false }
    await fetchEvidence()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to create evidence')
  } finally {
    saving.value = false
  }
}

const navigateToEvidence = (row: any) => {
  router.push(`/evidence/${row.id}`)
}
</script>

<style scoped lang="scss">
.evidence-container {
  padding: 0;
}

.evidence-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.filter-bar {
  display: flex;
  gap: var(--cat-spacing-4);
  margin-bottom: var(--cat-spacing-4);
  align-items: center;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.content {
  width: 100%;

  :deep(.el-pagination) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--cat-spacing-4);
  }
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}

.empty-state-contextual {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--cat-text-secondary);

  .el-icon {
    color: var(--cat-text-tertiary);
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 8px;
    color: var(--cat-text-primary);
    font-size: 16px;
  }

  p {
    margin: 0 0 20px;
    max-width: 400px;
    line-height: 1.5;
  }
}
</style>
