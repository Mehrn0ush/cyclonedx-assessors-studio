<template>
  <el-dialog
    v-model="visible"
    :title="t('signAttestation.title')"
    width="660px"
    :close-on-click-modal="false"
    :close-on-press-escape="!signing"
    @close="handleClose"
  >
    <div v-if="loading" class="loading-container" role="status" aria-live="polite">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span>{{ t('common.loading') }}</span>
    </div>

    <div v-else-if="loadError" class="error-container">
      <el-alert :title="t('common.error')" :description="loadError" type="error" :closable="false" />
      <el-button size="small" class="retry-button" @click="fetchSignatures">{{ t('common.retry') }}</el-button>
    </div>

    <template v-else>
      <el-alert
        v-if="warning"
        :title="warning"
        type="warning"
        show-icon
        :closable="false"
        class="mb-token-3"
      />

      <div v-if="signatures.length === 0" class="empty-state">
        <p>{{ t('signAttestation.noSignatures') }}</p>
        <el-button type="primary" @click="navigateToSettings">
          {{ t('signAttestation.goToSettings') }}
        </el-button>
      </div>

      <template v-else>
        <el-form label-width="180px" @submit.prevent>
          <el-form-item :label="t('signAttestation.filterType')">
            <el-radio-group v-model="typeFilter">
              <el-radio value="all">{{ t('signAttestation.filter_all') }}</el-radio>
              <el-radio value="electronic">{{ t('signatures.type_electronic') }}</el-radio>
              <el-radio value="digital">{{ t('signatures.type_digital') }}</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item :label="t('signAttestation.pickSignature')" required>
            <el-select
              v-model="selectedSignatureId"
              :placeholder="t('signAttestation.selectPlaceholder')"
              filterable
              :disabled="signing"
              class="w-full"
              @change="handleSignatureChange"
            >
              <el-option
                v-for="sig in filteredSignatures"
                :key="sig.id"
                :value="sig.id"
                :label="formatSignatureOptionLabel(sig)"
              >
                <div class="signature-option-row">
                  <span>{{ sig.label }}</span>
                  <el-tag
                    :type="sig.signatureType === 'digital' ? 'success' : 'info'"
                    size="small"
                    class="type-tag"
                  >
                    {{ t(`signatures.type_${sig.signatureType}`) }}
                    <template v-if="sig.signatureType === 'digital' && sig.signatureFormat">
                      / {{ sig.signatureFormat.toUpperCase() }}
                    </template>
                  </el-tag>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
        </el-form>

        <el-divider v-if="selectedSignature" />

        <!-- Electronic path: show the captured identity plus optional overrides -->
        <div v-if="selectedSignature?.signatureType === 'electronic'" class="sign-panel">
          <div class="identity-preview">
            <div class="identity-row">
              <label>{{ t('signatures.name') }}</label>
              <div>{{ (selectedSignature.payload as ElectronicSignaturePayload | null)?.name || '-' }}</div>
            </div>
            <div
              v-if="(selectedSignature.payload as ElectronicSignaturePayload | null)?.role"
              class="identity-row"
            >
              <label>{{ t('signatures.role') }}</label>
              <div>{{ (selectedSignature.payload as ElectronicSignaturePayload).role }}</div>
            </div>
            <div class="identity-row">
              <label>{{ t('signatures.orgName') }}</label>
              <div>{{ (selectedSignature.payload as ElectronicSignaturePayload | null)?.organization?.name || '-' }}</div>
            </div>
            <div v-if="selectedSignature.image" class="identity-row">
              <label>{{ t('signatures.image') }}</label>
              <img :src="signatureImageUrl(selectedSignature.id)" :alt="t('signatures.image')" class="identity-image" />
            </div>
          </div>

          <el-form label-width="180px">
            <el-form-item :label="t('signatures.signedName')">
              <el-input v-model="electronicOverrides.signedName" :disabled="signing" />
              <div class="form-hint">{{ t('signAttestation.signedNameHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('signatures.jurisdiction')">
              <el-input v-model="electronicOverrides.jurisdiction" :disabled="signing" />
            </el-form-item>
            <el-form-item :label="t('signatures.legalIntent')">
              <el-input
                v-model="electronicOverrides.legalIntent"
                type="textarea"
                :rows="2"
                :disabled="signing"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- Digital path: two step prepare plus signature value entry -->
        <div v-else-if="selectedSignature?.signatureType === 'digital'" class="sign-panel">
          <p class="digital-explainer">{{ t('signAttestation.digitalExplainer') }}</p>

          <div class="identity-row">
            <label>{{ t('signatures.signatureFormat') }}</label>
            <div>{{ selectedSignature.signatureFormat?.toUpperCase() || '-' }}</div>
          </div>
          <div class="identity-row">
            <label>{{ t('signatures.signatureAlgorithm') }}</label>
            <div>{{ (selectedSignature.payload as DigitalSignaturePayload | null)?.signatureAlgorithm || '-' }}</div>
          </div>
          <div class="identity-row">
            <label>{{ t('signAttestation.keyFingerprint') }}</label>
            <code class="fingerprint">{{ selectedSignature.keyFingerprint || '-' }}</code>
          </div>

          <el-divider />

          <div v-if="!canonicalHash" class="prepare-block">
            <el-button
              type="primary"
              :loading="preparing"
              :disabled="signing"
              @click="handlePrepare"
            >
              {{ t('signAttestation.prepare') }}
            </el-button>
            <div class="form-hint">{{ t('signAttestation.prepareHint') }}</div>
          </div>

          <div v-else>
            <el-form label-width="180px">
              <el-form-item :label="t('signAttestation.canonicalHash')">
                <div class="hash-copy-row">
                  <el-input :model-value="canonicalHash" readonly class="hash-input" />
                  <el-button @click="copyHash">{{ t('common.copy') }}</el-button>
                </div>
                <div class="form-hint">{{ t('signAttestation.canonicalHashHint') }}</div>
              </el-form-item>

              <el-form-item :label="t('signAttestation.signatureValue')" required>
                <el-input
                  v-model="digitalOverrides.signatureValue"
                  type="textarea"
                  :rows="4"
                  :disabled="signing"
                  :placeholder="t('signAttestation.signatureValuePlaceholder')"
                />
                <div class="form-hint">{{ t('signAttestation.signatureValueHint') }}</div>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </template>
    </template>

    <template #footer>
      <el-button :disabled="signing" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="signatures.length > 0"
        type="primary"
        :loading="signing"
        :disabled="!canSign"
        @click="handleSign"
      >
        {{ t('signAttestation.sign') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import axios from 'axios'
import {
  listMySignatures,
  signatureImageUrl,
  type StoredSignature,
  type ElectronicSignaturePayload,
  type DigitalSignaturePayload,
} from '@/api/me-signatures'

const props = defineProps<{
  modelValue: boolean
  attestationId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  signed: []
}>()

const { t } = useI18n()
const router = useRouter()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const loadError = ref('')
const warning = ref<string | null>(null)
const signatures = ref<StoredSignature[]>([])

const typeFilter = ref<'all' | 'electronic' | 'digital'>('all')
const selectedSignatureId = ref<string>('')

const signing = ref(false)
const preparing = ref(false)
const canonicalHash = ref<string>('')

const electronicOverrides = ref<{
  signedName: string
  jurisdiction: string
  legalIntent: string
}>({ signedName: '', jurisdiction: '', legalIntent: '' })

const digitalOverrides = ref<{ signatureValue: string }>({ signatureValue: '' })

const filteredSignatures = computed(() => {
  if (typeFilter.value === 'all') return signatures.value
  return signatures.value.filter((s) => s.signatureType === typeFilter.value)
})

const selectedSignature = computed<StoredSignature | null>(() =>
  signatures.value.find((s) => s.id === selectedSignatureId.value) ?? null,
)

const canSign = computed(() => {
  if (!selectedSignature.value) return false
  if (selectedSignature.value.signatureType === 'digital') {
    return Boolean(canonicalHash.value) && Boolean(digitalOverrides.value.signatureValue.trim())
  }
  return true
})

async function fetchSignatures() {
  loading.value = true
  loadError.value = ''
  try {
    const resp = await listMySignatures()
    signatures.value = resp.data
    warning.value = resp.warning
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    loadError.value = e.response?.data?.error || e.message || t('signatures.loadError')
  } finally {
    loading.value = false
  }
}

function resetState() {
  typeFilter.value = 'all'
  selectedSignatureId.value = ''
  canonicalHash.value = ''
  electronicOverrides.value = { signedName: '', jurisdiction: '', legalIntent: '' }
  digitalOverrides.value = { signatureValue: '' }
}

function handleClose() {
  if (!signing.value) resetState()
}

function handleSignatureChange() {
  canonicalHash.value = ''
  digitalOverrides.value.signatureValue = ''
  const sel = selectedSignature.value
  if (sel?.signatureType === 'electronic' && sel.payload) {
    const p = sel.payload as ElectronicSignaturePayload
    electronicOverrides.value = {
      signedName: p.signedName ?? '',
      jurisdiction: p.jurisdiction ?? '',
      legalIntent: p.legalIntent ?? '',
    }
  } else {
    electronicOverrides.value = { signedName: '', jurisdiction: '', legalIntent: '' }
  }
}

async function handlePrepare() {
  if (!props.attestationId) return
  preparing.value = true
  try {
    const { data } = await axios.post(`/api/v1/attestations/${props.attestationId}/sign/prepare`)
    canonicalHash.value = data.canonicalPayloadHash
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signAttestation.prepareError'))
  } finally {
    preparing.value = false
  }
}

async function copyHash() {
  if (!canonicalHash.value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(canonicalHash.value)
      ElMessage.success(t('signAttestation.hashCopied'))
    }
  } catch {
    ElMessage.error(t('signAttestation.copyError'))
  }
}

async function handleSign() {
  if (!props.attestationId || !selectedSignature.value) return

  signing.value = true
  try {
    const body: Record<string, unknown> = {
      userSignatureId: selectedSignature.value.id,
    }

    if (selectedSignature.value.signatureType === 'electronic') {
      if (electronicOverrides.value.signedName) body.signedName = electronicOverrides.value.signedName
      if (electronicOverrides.value.jurisdiction) body.jurisdiction = electronicOverrides.value.jurisdiction
      if (electronicOverrides.value.legalIntent) body.legalIntent = electronicOverrides.value.legalIntent
    } else {
      body.signatureValue = digitalOverrides.value.signatureValue.trim()
      if (canonicalHash.value) body.canonicalPayloadHash = canonicalHash.value
    }

    await axios.post(`/api/v1/attestations/${props.attestationId}/sign`, body)
    ElMessage.success(t('signAttestation.signedSuccess'))
    emit('signed')
    visible.value = false
    resetState()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signAttestation.signError'))
  } finally {
    signing.value = false
  }
}

function navigateToSettings() {
  visible.value = false
  router.push('/settings')
}

function formatSignatureOptionLabel(sig: StoredSignature): string {
  if (sig.signatureType === 'digital') {
    const fmt = sig.signatureFormat?.toUpperCase() ?? ''
    return `${sig.label} (${t('signatures.type_digital')}${fmt ? ` / ${fmt}` : ''})`
  }
  return `${sig.label} (${t('signatures.type_electronic')})`
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetState()
      void fetchSignatures()
    }
  },
)
</script>

<style scoped lang="scss">
.loading-container {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-4);
  color: var(--cat-text-secondary);
}

.error-container {
  padding: var(--cat-spacing-3) 0;

  .retry-button {
    margin-top: var(--cat-spacing-2);
  }
}

.empty-state {
  text-align: center;
  padding: var(--cat-spacing-4);
  color: var(--cat-text-tertiary);

  p {
    margin: 0 0 var(--cat-spacing-3) 0;
  }
}

.w-full {
  width: 100%;
}

.form-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: 4px;
}

.sign-panel {
  padding-top: var(--cat-spacing-2);
}

.identity-preview {
  margin-bottom: var(--cat-spacing-3);
}

.identity-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-2) 0;

  label {
    font-size: var(--cat-font-size-sm);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-tertiary);
  }
}

.identity-image {
  max-width: 160px;
  max-height: 80px;
  background: #ffffff;
  border: 1px solid var(--cat-border-color, #d1d5db);
  border-radius: 4px;
  padding: 4px;
}

.signature-option-row {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  justify-content: space-between;
}

.type-tag {
  flex-shrink: 0;
}

.digital-explainer {
  margin: 0 0 var(--cat-spacing-3) 0;
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
}

.prepare-block {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-2);
  align-items: flex-start;
}

.hash-copy-row {
  display: flex;
  gap: var(--cat-spacing-2);
  align-items: center;

  .hash-input {
    flex: 1;

    :deep(input) {
      font-family: var(--cat-font-mono);
      font-size: var(--cat-font-size-xs);
    }
  }
}

.fingerprint {
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
  word-break: break-all;
}
</style>
