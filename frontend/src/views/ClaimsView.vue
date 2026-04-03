<template>
  <div class="claims-container">
    <PageHeader :title="t('claims.title')">
      <template #actions>
        <el-button type="primary" @click="openNewClaimDialog">{{ t('common.create') }}</el-button>
      </template>
    </PageHeader>

    <div class="claims-content">
      <div class="filter-bar" role="search">
        <el-input v-model="searchText" :placeholder="'Search claims...'" style="width: 250px" clearable />
        <div style="display: flex; align-items: center; gap: 8px;">
          <el-select v-model="filterCounterClaim" placeholder="All Claims" style="width: 150px" clearable>
            <el-option label="All Claims" value="" />
            <el-option label="Claims Only" value="false" />
            <el-option label="Counter Claims Only" value="true" />
          </el-select>
          <HelpTip content="Counter claims document exceptions, non-applicability, or disputes against a primary claim." />
        </div>
      </div>

      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchClaims" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <div v-else-if="filteredClaims.length === 0" class="empty-state-contextual">
        <el-icon :size="48"><ChatLineSquare /></el-icon>
        <h3>{{ t('claims.noClaims') }}</h3>
        <p>{{ t('claims.noClaimsDescription') }}</p>
        <el-button type="primary" @click="openNewClaimDialog">{{ t('common.create') }}</el-button>
      </div>

      <el-table v-else :data="filteredClaims" stripe border role="grid" aria-label="Claims table" @row-click="handleRowClick">
        <el-table-column prop="name" :label="t('claims.name')" min-width="250" sortable></el-table-column>
        <el-table-column prop="target" :label="t('claims.target')" width="200" sortable></el-table-column>
        <el-table-column prop="predicate" width="200">
          <template #header>
            <span>{{ t('claims.predicate') }} <HelpTip :content="t('claims.predicateDescription')" /></span>
          </template>
          <template #default="{ row }">
            <span class="truncate">{{ row.predicate }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('claims.evidence')" width="120">
          <template #default="{ row }">
            <span>{{ getEvidenceCount(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.created')" width="150">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.counter')" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.is_counter_claim" type="danger">{{ t('common.counter') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="attestation_id" :label="t('claims.attestation')" width="200" sortable></el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalClaims"
        layout="total, prev, pager, next"
        @current-change="currentPage = 1"
      />
    </div>

    <el-dialog v-model="showDialog" :title="dialogTitle" width="600px">
      <el-form :model="form" label-width="150px" @submit.prevent="handleSave">
        <el-form-item :label="t('claims.name')" required>
          <el-input v-model="form.name" :placeholder="t('claims.name')" />
        </el-form-item>

        <el-form-item :label="t('claims.target')" required>
          <el-input v-model="form.target" :placeholder="t('claims.target')" />
        </el-form-item>

        <el-form-item :label="t('claims.predicate')" required>
          <el-input v-model="form.predicate" :placeholder="t('claims.predicate')" />
        </el-form-item>

        <el-form-item :label="t('common.description')" required>
          <el-input v-model="form.reasoning" :placeholder="t('common.description')" type="textarea" :rows="4" />
        </el-form-item>

        <el-form-item :label="t('claims.supportingEvidence')">
          <el-select v-model="form.evidenceIds" multiple filterable :placeholder="t('claims.selectEvidence')" clearable>
            <el-option v-for="evidence in allEvidence" :key="evidence.id" :label="`${evidence.name} (${evidence.state})`" :value="evidence.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('claims.counterEvidence')">
          <el-select v-model="form.counterEvidenceIds" multiple filterable :placeholder="t('claims.selectEvidence')" clearable>
            <el-option v-for="evidence in allEvidence" :key="evidence.id" :label="`${evidence.name} (${evidence.state})`" :value="evidence.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('common.counter')">
          <el-checkbox v-model="form.isCounterClaim">{{ t('common.counter') }}</el-checkbox>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="showDetailDrawer" :title="t('claims.details')" size="50%">
      <div v-if="selectedClaim" class="detail-drawer-content">
        <div class="detail-section">
          <h4>{{ t('claims.name') }}</h4>
          <p>{{ selectedClaim.name }}</p>
        </div>

        <div class="detail-section">
          <h4>{{ t('claims.target') }}</h4>
          <p>{{ selectedClaim.target }}</p>
        </div>

        <div class="detail-section">
          <h4>{{ t('claims.predicate') }}</h4>
          <p>{{ selectedClaim.predicate }}</p>
        </div>

        <div class="detail-section">
          <h4>{{ t('common.description') }}</h4>
          <p>{{ selectedClaim.reasoning }}</p>
        </div>

        <div v-if="selectedClaimDetail.evidence && selectedClaimDetail.evidence.length > 0" class="detail-section">
          <h4>{{ t('claims.supportingEvidence') }}</h4>
          <div class="evidence-list">
            <div v-for="evidence in selectedClaimDetail.evidence" :key="evidence.id" class="evidence-item">
              <span class="evidence-name">{{ evidence.name }}</span>
              <StateBadge :state="evidence.state" />
            </div>
          </div>
        </div>

        <div v-if="selectedClaimDetail.counterEvidence && selectedClaimDetail.counterEvidence.length > 0" class="detail-section">
          <h4>{{ t('claims.counterEvidence') }}</h4>
          <div class="evidence-list">
            <div v-for="evidence in selectedClaimDetail.counterEvidence" :key="evidence.id" class="evidence-item">
              <span class="evidence-name">{{ evidence.name }}</span>
              <StateBadge :state="evidence.state" />
            </div>
          </div>
        </div>

        <div class="detail-actions">
          <el-button type="primary" @click="openEditDialog">{{ t('common.edit') }}</el-button>
          <el-button @click="showDetailDrawer = false">{{ t('common.close') }}</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, ChatLineSquare } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()

const claims = ref([])
const allEvidence = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const showDialog = ref(false)
const showDetailDrawer = ref(false)
const saving = ref(false)
const dialogTitle = ref(t('claims.claim'))
const selectedClaim = ref(null)
const selectedClaimDetail = ref({
  evidence: [],
  counterEvidence: [],
  mitigationStrategies: []
})
const isEditMode = ref(false)
const editingClaimId = ref(null)
const searchText = ref('')
const filterCounterClaim = ref('')

const form = ref({
  name: '',
  target: '',
  predicate: '',
  reasoning: '',
  isCounterClaim: false,
  evidenceIds: [],
  counterEvidenceIds: []
})

const filteredClaims = computed(() => {
  const filtered = claims.value.filter((c: any) => {
    const matchesSearch = !searchText.value ||
      c.name.toLowerCase().includes(searchText.value.toLowerCase()) ||
      c.target?.toLowerCase().includes(searchText.value.toLowerCase())
    const matchesType = !filterCounterClaim.value ||
      String(c.is_counter_claim) === filterCounterClaim.value
    return matchesSearch && matchesType
  })
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

const totalClaims = computed(() => {
  return claims.value.filter((c: any) => {
    const matchesSearch = !searchText.value ||
      c.name.toLowerCase().includes(searchText.value.toLowerCase()) ||
      c.target?.toLowerCase().includes(searchText.value.toLowerCase())
    const matchesType = !filterCounterClaim.value ||
      String(c.is_counter_claim) === filterCounterClaim.value
    return matchesSearch && matchesType
  }).length
})

const fetchClaims = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get('/api/v1/claims')
    claims.value = response.data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch claims'
  } finally {
    loading.value = false
  }
}

const fetchAllEvidence = async () => {
  try {
    const response = await axios.get('/api/v1/evidence')
    allEvidence.value = response.data.data || []
  } catch (err: any) {
    console.error('Failed to fetch evidence:', err)
  }
}

const getEvidenceCount = (claim: any) => {
  const supportingCount = claim.evidence_ids ? claim.evidence_ids.length : 0
  const counterCount = claim.counter_evidence_ids ? claim.counter_evidence_ids.length : 0
  const total = supportingCount + counterCount
  return total > 0 ? `${total} ${t('claims.evidence')}` : '-'
}

const openNewClaimDialog = () => {
  form.value = {
    name: '',
    target: '',
    predicate: '',
    reasoning: '',
    isCounterClaim: false,
    evidenceIds: [],
    counterEvidenceIds: []
  }
  isEditMode.value = false
  editingClaimId.value = null
  showDialog.value = true
  dialogTitle.value = t('common.create')
  fetchAllEvidence()
}

const handleRowClick = async (row: any) => {
  selectedClaim.value = row
  try {
    const response = await axios.get(`/api/v1/claims/${row.id}`)
    selectedClaimDetail.value = response.data.data || {
      evidence: [],
      counterEvidence: [],
      mitigationStrategies: []
    }
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to fetch claim details')
  }
  showDetailDrawer.value = true
}

const openEditDialog = () => {
  if (selectedClaim.value) {
    form.value = {
      name: selectedClaim.value.name,
      target: selectedClaim.value.target,
      predicate: selectedClaim.value.predicate,
      reasoning: selectedClaim.value.reasoning,
      isCounterClaim: selectedClaim.value.is_counter_claim || false,
      evidenceIds: selectedClaimDetail.value.evidence?.map((e: any) => e.id) || [],
      counterEvidenceIds: selectedClaimDetail.value.counterEvidence?.map((e: any) => e.id) || []
    }
    isEditMode.value = true
    editingClaimId.value = selectedClaim.value.id
    showDetailDrawer.value = false
    showDialog.value = true
    dialogTitle.value = t('common.edit')
    fetchAllEvidence()
  }
}

const handleSave = async () => {
  if (!form.value.name || !form.value.target || !form.value.predicate || !form.value.reasoning) {
    ElMessage.error('Please fill in all required fields')
    return
  }

  saving.value = true
  try {
    const payload = {
      name: form.value.name,
      target: form.value.target,
      predicate: form.value.predicate,
      reasoning: form.value.reasoning,
      isCounterClaim: form.value.isCounterClaim,
      evidenceIds: form.value.evidenceIds,
      counterEvidenceIds: form.value.counterEvidenceIds
    }

    if (isEditMode.value && editingClaimId.value) {
      await axios.put(`/api/v1/claims/${editingClaimId.value}`, payload)
      ElMessage.success(t('claims.claimUpdated'))
    } else {
      await axios.post('/api/v1/claims', payload)
      ElMessage.success(t('common.success'))
    }

    showDialog.value = false
    fetchClaims()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to save claim')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchClaims()
})
</script>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as mixins;

.claims-container {
  padding: 0;
}

.claims-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);

  :deep(.el-pagination) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--cat-spacing-4);
  }
}

.filter-bar {
  display: flex;
  gap: var(--cat-spacing-4);
  margin-bottom: var(--cat-spacing-4);
  align-items: center;
}

.truncate {
  @include mixins.truncate;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.error-container {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);

  .retry-button {
    margin-top: 16px;
  }
}

.detail-drawer-content {
  padding: var(--cat-spacing-4);
}

.detail-section {
  margin-bottom: var(--cat-spacing-6);

  h4 {
    margin: 0 0 var(--cat-spacing-2) 0;
    font-weight: 600;
    color: var(--cat-text-primary);
  }

  p {
    margin: 0;
    color: var(--cat-text-secondary);
    word-break: break-word;
    white-space: pre-wrap;
  }
}

.evidence-list {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-2);
}

.evidence-item {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-2) var(--cat-spacing-3);
  background-color: var(--cat-bg-secondary);
  border-radius: 4px;

  .evidence-name {
    flex: 1;
    color: var(--cat-text-primary);
    font-weight: 500;
  }
}

.detail-actions {
  display: flex;
  gap: var(--cat-spacing-3);
  margin-top: var(--cat-spacing-6);
  border-top: 1px solid var(--cat-border-primary);
  padding-top: var(--cat-spacing-4);
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
