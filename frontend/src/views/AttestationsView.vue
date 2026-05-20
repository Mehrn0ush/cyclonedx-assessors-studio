<template>
  <div class="attestations-container">
    <PageHeader :title="t('attestations.title')">
      <template #actions>
        <el-button v-if="canCreate" type="primary" @click="openNewAttestationDialog">{{ t('common.create') }}</el-button>
      </template>
    </PageHeader>

    <div class="attestations-content">
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchAttestations" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <div v-else-if="attestations.length === 0" class="empty-state-contextual">
        <el-icon :size="48"><Stamp /></el-icon>
        <h3>{{ t('attestations.noAttestations') }}</h3>
        <p>{{ t('attestations.noAttestationsDescription') }}</p>
        <el-button v-if="canCreate" type="primary" @click="openNewAttestationDialog">{{ t('common.create') }}</el-button>
      </div>

      <div v-else class="content">
        <el-table :data="pagedAttestations" stripe border aria-label="Attestations table">
          <el-table-column min-width="280">
            <template #header>
              <span>{{ t('attestations.summary') }} <HelpTip content="Attestations are formal records that link assessment results to signed declarations of conformance." /></span>
            </template>
            <template #default="{ row }">
              {{ row.summary }}
            </template>
          </el-table-column>
          <el-table-column prop="assessmentId" :label="t('attestations.assessment')" min-width="150" sortable>
            <template #default="{ row }">
              {{ row.assessmentTitle || row.assessmentId }}
            </template>
          </el-table-column>
          <el-table-column label="Assessor" min-width="150" sortable>
            <template #default="{ row }">
              <span v-if="row.assessorEntityName">
                {{ row.assessorEntityName }}
                <el-tag v-if="row.assessorThirdParty" type="info" size="small" class="ml-2">3rd Party</el-tag>
              </span>
              <span v-else class="text-tertiary">&#8212;</span>
            </template>
          </el-table-column>
          <el-table-column prop="signatoryId" :label="t('attestations.signatory')" min-width="150" sortable>
            <template #default="{ row }">
              {{ row.signatoryName || row.signatoryId || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('common.created')" min-width="140" sortable>
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" min-width="140">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button
                  v-if="canExport"
                  size="small"
                  @click="handleExport(row)"
                >
                  {{ t('attestations.export') }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="attestations.length"
          layout="total, prev, pager, next"
          @current-change="currentPage = 1"
        />
      </div>
    </div>

    <!--
      PR3.6: The per-attestation Sign / Verify / Rescind flows on this
      view were removed. Signing is now driven by the assessment
      affirmation and cascades into every attestation on that
      assessment. See the Affirmation panel on the assessment detail
      screen for the new flow.
    -->
    <el-dialog v-model="showDialog" :title="dialogTitle" width="500px">
      <el-form :model="form" label-width="120px" @submit.prevent="handleSave">
        <el-form-item :label="t('attestations.summary')" required>
          <el-input v-model="form.summary" :placeholder="t('attestations.summary')" type="textarea" :rows="4" />
        </el-form-item>

        <el-form-item :label="t('attestations.assessment')" required>
          <el-select v-model="form.assessmentId" :placeholder="t('attestations.assessment')" clearable aria-required="true">
            <el-option v-for="item in completedAssessments" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, Stamp } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import { formatDate } from '@/utils/dateFormat'
import { apiErrorMessage } from '@/utils/errorMessage'
import { useAuthStore } from '@/stores/auth'
import type { Assessment } from '@/types'

const { t } = useI18n()
const authStore = useAuthStore()

const attestations = ref<Record<string, unknown>[]>([])
const assessments = ref<Assessment[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const showDialog = ref(false)
const saving = ref(false)
const dialogTitle = ref(t('attestations.title'))

// PR3.6: Sign / Verify / Rescind actions were removed from this view.
// Those flows moved to the affirmation primitive on the assessment,
// which cascades its signed envelope into every attestation at export
// time. Only Create and Export remain gated here.
const canCreate = computed(() => authStore.hasPermission('attestations.create'))
const canExport = computed(() => authStore.hasPermission('attestations.export'))

const completedAssessments = computed(() => assessments.value.filter((a: Assessment) => a.state === 'complete'))

const pagedAttestations = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return attestations.value.slice(start, end)
})

const form = ref({
  summary: '',
  assessmentId: '',
})

const fetchAttestations = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get('/api/v1/attestations')
    attestations.value = response.data.data || []
  } catch (err: unknown) {
    error.value = apiErrorMessage(err, 'Failed to fetch attestations')
  } finally {
    loading.value = false
  }
}

const fetchAssessments = async () => {
  try {
    const response = await axios.get('/api/v1/assessments')
    assessments.value = response.data.data || []
  } catch (err: unknown) {
    console.error('Failed to fetch assessments:', err)
  }
}

const openNewAttestationDialog = () => {
  form.value = {
    summary: '',
    assessmentId: '',
  }
  showDialog.value = true
  dialogTitle.value = t('common.create')
}

const handleSave = async () => {
  if (!form.value.summary || !form.value.assessmentId) {
    ElMessage.error('Please fill in all required fields')
    return
  }

  saving.value = true
  try {
    await axios.post('/api/v1/attestations', {
      summary: form.value.summary,
      assessmentId: form.value.assessmentId,
    })

    ElMessage.success(t('common.success'))
    showDialog.value = false
    fetchAttestations()
  } catch (err: unknown) {
    ElMessage.error(apiErrorMessage(err, 'Failed to create attestation'))
  } finally {
    saving.value = false
  }
}

const handleExport = async (row: Record<string, unknown>) => {
  try {
    // Use responseType: 'blob' to preserve binary content on download
    const response = await axios.get(`/api/v1/attestations/${row.id as string}/export`, {
      responseType: 'blob',
    })
    const blob = new Blob([response.data], { type: 'application/vnd.cyclonedx+json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `attestation-${row.id as string}.cdx.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err: unknown) {
    ElMessage.error(apiErrorMessage(err, 'Failed to export attestation'))
  }
}

onMounted(() => {
  fetchAttestations()
  fetchAssessments()
})
</script>

<style scoped lang="scss">
.attestations-container {
  padding: 0;
}

.attestations-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.content {
  width: 100%;

  :deep(.el-pagination) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--cat-spacing-4);
  }
}

.row-actions {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

:deep(.el-table tbody tr) {
  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
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
