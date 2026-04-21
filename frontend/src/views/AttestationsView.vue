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
        <el-table :data="pagedAttestations" stripe border role="grid" aria-label="Attestations table">
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
          <el-table-column :label="t('attestations.status')" min-width="130">
            <template #default="{ row }">
              <el-tag v-if="row.rescindedAt" type="danger" size="small">{{ t('attestations.rescinded') }}</el-tag>
              <el-tag v-else-if="row.signedAt" type="success" size="small">{{ t('attestations.signed') }}</el-tag>
              <el-tag v-else type="info" size="small">{{ t('attestations.draft') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('common.created')" min-width="140" sortable>
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="220" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button
                  v-if="!row.signedAt && canSign"
                  size="small"
                  type="primary"
                  @click="openSignDialog(row)"
                >
                  {{ t('attestations.sign') }}
                </el-button>
                <el-button
                  v-if="row.signedAt && canVerify"
                  size="small"
                  @click="handleVerify(row)"
                >
                  {{ t('attestations.verify') }}
                </el-button>
                <el-button
                  v-if="row.signedAt && !row.rescindedAt && canRescind"
                  size="small"
                  type="danger"
                  @click="openRescindDialog(row)"
                >
                  {{ t('attestations.rescind') }}
                </el-button>
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
        <!--
          Signatory is captured at sign time, not at create time. The
          legacy backend field is still optional and the server accepts
          an absent signatoryId.
        -->
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!--
      Sign dialog covers both signature shapes that CycloneDX supports:
        - Electronic (ESIGN): a typed name plus optional image and intent
        - Digital: detached signature with algorithm, value, public key
      Signature material is captured at sign time and stored with the
      attestation record. The backend freezes the record on sign, so a
      user cannot edit a signed attestation afterwards.
    -->
    <el-dialog
      v-model="showSignDialog"
      :title="t('attestations.signTitle')"
      width="600px"
      @close="resetSignForm"
    >
      <el-form :model="signForm" label-width="150px">
        <el-form-item :label="t('attestations.signatureType')">
          <el-radio-group v-model="signForm.signatureType">
            <el-radio-button value="electronic">{{ t('attestations.signatureTypeElectronic') }}</el-radio-button>
            <el-radio-button value="digital">{{ t('attestations.signatureTypeDigital') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="signForm.signatureType === 'electronic'">
          <el-form-item :label="t('attestations.signedName')" required>
            <el-input v-model="signForm.signedName" :placeholder="t('attestations.signedNamePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('attestations.jurisdiction')">
            <el-input v-model="signForm.jurisdiction" placeholder="e.g. US-CA" />
          </el-form-item>
          <el-form-item :label="t('attestations.legalIntent')">
            <el-input
              v-model="signForm.legalIntent"
              type="textarea"
              :rows="2"
              :placeholder="t('attestations.legalIntentPlaceholder')"
            />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item :label="t('attestations.algorithm')" required>
            <el-select v-model="signForm.signatureAlgorithm" placeholder="Select algorithm">
              <el-option label="RSA-SHA256" value="RSA-SHA256" />
              <el-option label="RSA-SHA384" value="RSA-SHA384" />
              <el-option label="RSA-SHA512" value="RSA-SHA512" />
              <el-option label="SHA256" value="SHA256" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('attestations.signatureValue')" required>
            <el-input
              v-model="signForm.signatureValue"
              type="textarea"
              :rows="3"
              placeholder="Base64-encoded signature"
            />
          </el-form-item>
          <el-form-item :label="t('attestations.publicKey')" required>
            <el-input
              v-model="signForm.publicKeyPem"
              type="textarea"
              :rows="4"
              placeholder="-----BEGIN PUBLIC KEY-----..."
            />
          </el-form-item>
          <el-form-item :label="t('attestations.certificateChain')">
            <el-input
              v-model="signForm.certificateChain"
              type="textarea"
              :rows="3"
              placeholder="-----BEGIN CERTIFICATE-----..."
            />
          </el-form-item>
        </template>

        <el-form-item :label="t('attestations.signatoryId')">
          <el-input v-model="signForm.signatoryId" placeholder="Optional signatory record UUID" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showSignDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="signing" @click="handleSign">{{ t('attestations.sign') }}</el-button>
      </template>
    </el-dialog>

    <!-- Rescind captures a required reason; the record stays but is
         marked withdrawn. -->
    <el-dialog
      v-model="showRescindDialog"
      :title="t('attestations.rescindTitle')"
      width="480px"
      @close="rescindReason = ''"
    >
      <el-form label-width="100px">
        <el-form-item :label="t('attestations.rescindReason')" required>
          <el-input
            v-model="rescindReason"
            type="textarea"
            :rows="3"
            :placeholder="t('attestations.rescindReasonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRescindDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" :loading="rescinding" @click="handleRescind">{{ t('attestations.rescind') }}</el-button>
      </template>
    </el-dialog>

    <!-- Verify result dialog: shows the structured outcome from the
         backend with any drift or signature-verification issues. -->
    <el-dialog v-model="showVerifyDialog" :title="t('attestations.verifyResult')" width="600px">
      <div v-if="verifyResult" class="verify-result">
        <div class="verify-status">
          <el-tag v-if="verifyResult.verified" type="success" size="large">
            {{ t('attestations.verifySuccess') }}
          </el-tag>
          <el-tag v-else type="danger" size="large">
            {{ t('attestations.verifyFailed') }}
          </el-tag>
        </div>
        <el-descriptions :column="1" border class="mt-4">
          <el-descriptions-item :label="t('attestations.signatureType')">
            {{ verifyResult.signatureType || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('attestations.payloadMatches')">
            <el-tag :type="verifyResult.payloadMatches ? 'success' : 'danger'" size="small">
              {{ verifyResult.payloadMatches ? 'Yes' : 'No' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="verifyResult.signatureType === 'digital'" :label="t('attestations.signatureValid')">
            <el-tag :type="verifyResult.signatureValid ? 'success' : 'danger'" size="small">
              {{ verifyResult.signatureValid ? 'Yes' : 'No' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="verifyResult.rescinded" :label="t('attestations.rescinded')">
            <el-tag type="danger" size="small">Yes</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="verifyResult.issues && verifyResult.issues.length > 0" class="verify-issues">
          <h4>{{ t('attestations.verifyIssues') }}</h4>
          <ul>
            <li v-for="(issue, idx) in verifyResult.issues" :key="idx">{{ issue }}</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <el-button @click="showVerifyDialog = false">{{ t('common.close') }}</el-button>
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

// Lifecycle permission gates. Each action is permission-gated on the
// server, but we hide buttons the user cannot use so the row action
// strip stays tidy.
const canCreate = computed(() => authStore.hasPermission('attestations.create'))
const canSign = computed(() => authStore.hasPermission('attestations.sign'))
const canVerify = computed(() => authStore.hasPermission('attestations.verify'))
const canRescind = computed(() => authStore.hasPermission('attestations.rescind'))
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

// Sign dialog state. signatureType drives which fields are visible.
const showSignDialog = ref(false)
const signing = ref(false)
const signTargetId = ref('')
const signForm = ref({
  signatureType: 'electronic' as 'electronic' | 'digital',
  signedName: '',
  jurisdiction: '',
  legalIntent: '',
  signatureAlgorithm: 'RSA-SHA256',
  signatureValue: '',
  publicKeyPem: '',
  certificateChain: '',
  signatoryId: '',
})

// Rescind dialog state
const showRescindDialog = ref(false)
const rescinding = ref(false)
const rescindTargetId = ref('')
const rescindReason = ref('')

// Verify result dialog state
const showVerifyDialog = ref(false)
const verifyResult = ref<Record<string, unknown> | null>(null)

const fetchAttestations = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get('/api/v1/attestations')
    attestations.value = response.data.data || []
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string } }; message?: string }
    error.value = e.response?.data?.message || e.message || 'Failed to fetch attestations'
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
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.message || e.response?.data?.error || 'Failed to create attestation')
  } finally {
    saving.value = false
  }
}

const openSignDialog = (row: Record<string, unknown>) => {
  signTargetId.value = row.id as string
  resetSignForm()
  showSignDialog.value = true
}

const resetSignForm = () => {
  signForm.value = {
    signatureType: 'electronic',
    signedName: '',
    jurisdiction: '',
    legalIntent: '',
    signatureAlgorithm: 'RSA-SHA256',
    signatureValue: '',
    publicKeyPem: '',
    certificateChain: '',
    signatoryId: '',
  }
}

const handleSign = async () => {
  if (signForm.value.signatureType === 'electronic' && !signForm.value.signedName.trim()) {
    ElMessage.error(t('attestations.signedNameRequired'))
    return
  }
  if (signForm.value.signatureType === 'digital') {
    if (!signForm.value.signatureValue.trim() || !signForm.value.publicKeyPem.trim()) {
      ElMessage.error(t('attestations.digitalMaterialRequired'))
      return
    }
  }

  signing.value = true
  try {
    const payload: Record<string, unknown> = {
      signatureType: signForm.value.signatureType,
    }
    if (signForm.value.signatoryId.trim()) payload.signatoryId = signForm.value.signatoryId.trim()
    if (signForm.value.signatureType === 'electronic') {
      payload.signedName = signForm.value.signedName.trim()
      if (signForm.value.jurisdiction.trim()) payload.jurisdiction = signForm.value.jurisdiction.trim()
      if (signForm.value.legalIntent.trim()) payload.legalIntent = signForm.value.legalIntent.trim()
    } else {
      payload.signatureAlgorithm = signForm.value.signatureAlgorithm
      payload.signatureValue = signForm.value.signatureValue.trim()
      payload.publicKeyPem = signForm.value.publicKeyPem.trim()
      if (signForm.value.certificateChain.trim()) payload.certificateChain = signForm.value.certificateChain.trim()
    }

    await axios.post(`/api/v1/attestations/${signTargetId.value}/sign`, payload)
    ElMessage.success(t('attestations.signSuccess'))
    showSignDialog.value = false
    fetchAttestations()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.response?.data?.message || 'Failed to sign attestation')
  } finally {
    signing.value = false
  }
}

const handleVerify = async (row: Record<string, unknown>) => {
  try {
    const response = await axios.post(`/api/v1/attestations/${row.id as string}/verify`)
    verifyResult.value = response.data
    showVerifyDialog.value = true
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.response?.data?.message || 'Failed to verify attestation')
  }
}

const openRescindDialog = (row: Record<string, unknown>) => {
  rescindTargetId.value = row.id as string
  rescindReason.value = ''
  showRescindDialog.value = true
}

const handleRescind = async () => {
  if (!rescindReason.value.trim()) {
    ElMessage.error(t('attestations.rescindReasonRequired'))
    return
  }
  rescinding.value = true
  try {
    await axios.post(`/api/v1/attestations/${rescindTargetId.value}/rescind`, {
      reason: rescindReason.value.trim(),
    })
    ElMessage.success(t('attestations.rescindSuccess'))
    showRescindDialog.value = false
    fetchAttestations()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.response?.data?.message || 'Failed to rescind attestation')
  } finally {
    rescinding.value = false
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
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.response?.data?.message || 'Failed to export attestation')
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

.verify-result {
  .verify-status {
    text-align: center;
    padding: var(--cat-spacing-3) 0;
  }

  .verify-issues {
    margin-top: var(--cat-spacing-4);
    padding: var(--cat-spacing-3);
    background: var(--cat-bg-secondary);
    border-radius: var(--cat-radius-md);
    border: 1px solid var(--cat-border-default);

    h4 {
      margin: 0 0 var(--cat-spacing-2);
      font-size: var(--cat-font-size-sm);
      color: var(--cat-text-primary);
    }

    ul {
      margin: 0;
      padding-left: var(--cat-spacing-4);
      color: var(--cat-text-secondary);
      font-size: var(--cat-font-size-sm);

      li {
        margin-bottom: var(--cat-spacing-1);
      }
    }
  }
}
</style>
