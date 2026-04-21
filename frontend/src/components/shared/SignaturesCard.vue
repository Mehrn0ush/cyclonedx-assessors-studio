<template>
  <el-card class="signatures-card">
    <template #header>
      <div class="signatures-header">
        <span>{{ t('signatures.title') }}</span>
        <el-button type="primary" size="small" @click="openCreateDialog">
          {{ t('signatures.add') }}
        </el-button>
      </div>
    </template>

    <el-alert
      v-if="warning"
      :title="warning"
      type="warning"
      show-icon
      :closable="false"
      class="signatures-warning"
    />

    <div v-if="loading" class="loading-container" role="status" aria-live="polite">
      <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      <span>{{ t('common.loading') }}</span>
    </div>

    <div v-else-if="error" class="error-container">
      <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
      <el-button size="small" class="retry-button" @click="fetchAll">{{ t('common.retry') }}</el-button>
    </div>

    <template v-else>
      <div v-if="signatures.length === 0" class="empty-state-small">
        <p>{{ t('signatures.empty') }}</p>
      </div>

      <el-table v-else :data="signatures" stripe border :aria-label="t('signatures.tableLabel')">
        <el-table-column prop="label" :label="t('signatures.label')" min-width="180" />
        <el-table-column :label="t('signatures.type')" width="130">
          <template #default="{ row }">
            <el-tag :type="row.signatureType === 'digital' ? 'success' : 'info'" size="small">
              {{ t(`signatures.type_${row.signatureType}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('signatures.format')" width="110">
          <template #default="{ row }">
            <span v-if="row.signatureType === 'digital'">{{ row.signatureFormat?.toUpperCase() || '-' }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('signatures.identity')" min-width="200">
          <template #default="{ row }">
            <span v-if="row.signatureType === 'electronic'">
              {{ electronicIdentityLine(row) }}
            </span>
            <code v-else class="fingerprint-cell">{{ shortFingerprint(row.keyFingerprint) }}</code>
          </template>
        </el-table-column>
        <el-table-column :label="t('signatures.image')" width="110">
          <template #default="{ row }">
            <span v-if="row.signatureType !== 'electronic'" class="muted">-</span>
            <el-tag v-else-if="row.image" type="success" size="small">{{ t('signatures.uploaded') }}</el-tag>
            <el-tag v-else type="info" size="small">{{ t('signatures.noImage') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" :label="t('signatures.created')" min-width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="200">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditDialog(row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="row.signatureType === 'electronic'"
              link
              type="primary"
              size="small"
              @click="openImageDialog(row)"
            >
              {{ t('signatures.manageImage') }}
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showEditorDialog"
      :title="editingId ? t('signatures.editSignature') : t('signatures.addSignature')"
      width="680px"
      :close-on-click-modal="false"
      @close="resetEditor"
    >
      <el-form :model="editorForm" label-width="180px" @submit.prevent>
        <el-form-item :label="t('signatures.label')" required>
          <el-input v-model="editorForm.label" maxlength="255" :disabled="saving" />
          <div class="form-hint">{{ t('signatures.labelHint') }}</div>
        </el-form-item>

        <el-form-item :label="t('signatures.type')" required>
          <el-radio-group v-model="editorForm.signatureType" :disabled="!!editingId || saving">
            <el-radio value="electronic">{{ t('signatures.type_electronic') }}</el-radio>
            <el-radio value="digital">{{ t('signatures.type_digital') }}</el-radio>
          </el-radio-group>
          <div v-if="editingId" class="form-hint">{{ t('signatures.typeImmutable') }}</div>
        </el-form-item>

        <!-- Electronic fields -->
        <template v-if="editorForm.signatureType === 'electronic'">
          <el-form-item :label="t('signatures.name')" required>
            <el-input v-model="editorForm.electronic.name" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.role')">
            <el-input v-model="editorForm.electronic.role" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.signedName')">
            <el-input v-model="editorForm.electronic.signedName" :disabled="saving" />
            <div class="form-hint">{{ t('signatures.signedNameHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('signatures.orgName')" required>
            <el-input v-model="editorForm.electronic.organizationName" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.orgUrl')">
            <el-input v-model="editorForm.electronic.organizationUrl" :disabled="saving" placeholder="https://example.com" />
          </el-form-item>

          <el-form-item :label="t('signatures.country')">
            <el-input v-model="editorForm.electronic.country" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.region')">
            <el-input v-model="editorForm.electronic.region" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.locality')">
            <el-input v-model="editorForm.electronic.locality" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.streetAddress')">
            <el-input v-model="editorForm.electronic.streetAddress" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.postalCode')">
            <el-input v-model="editorForm.electronic.postalCode" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.jurisdiction')">
            <el-input v-model="editorForm.electronic.jurisdiction" :disabled="saving" />
          </el-form-item>

          <el-form-item :label="t('signatures.legalIntent')">
            <el-input
              v-model="editorForm.electronic.legalIntent"
              type="textarea"
              :rows="2"
              :disabled="saving"
              :placeholder="t('signatures.legalIntentPlaceholder')"
            />
          </el-form-item>
        </template>

        <!-- Digital fields -->
        <template v-else>
          <el-form-item :label="t('signatures.signatureFormat')" required>
            <el-radio-group v-model="editorForm.digital.signatureFormat" :disabled="!!editingId || saving">
              <el-radio value="jsf">JSF (CycloneDX 1.x)</el-radio>
              <el-radio value="x509">X.509 (CycloneDX 2.x)</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item :label="t('signatures.signatureAlgorithm')" required>
            <el-select v-model="editorForm.digital.signatureAlgorithm" filterable :disabled="saving" class="w-240">
              <el-option
                v-for="alg in JSF_ASYMMETRIC_ALGORITHMS"
                :key="alg"
                :label="JSF_ALGORITHM_LABELS[alg]"
                :value="alg"
              />
            </el-select>
            <div class="form-hint">{{ t('signatures.algorithmHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('signatures.publicKeyPem')" required>
            <el-input
              v-model="editorForm.digital.publicKeyPem"
              type="textarea"
              :rows="6"
              :disabled="saving"
              placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
            />
            <div class="form-hint">{{ t('signatures.publicKeyHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('signatures.certificateChain')">
            <el-input
              v-model="editorForm.digital.certificateChain"
              type="textarea"
              :rows="4"
              :disabled="saving"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            />
            <div class="form-hint">{{ t('signatures.certificateChainHint') }}</div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button :disabled="saving" @click="showEditorDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Image Management Dialog -->
    <el-dialog
      v-model="showImageDialog"
      :title="t('signatures.manageImage')"
      width="520px"
      :close-on-click-modal="false"
      @close="resetImageDialog"
    >
      <div v-if="imageDialogSignature">
        <p class="image-subtitle">
          <strong>{{ imageDialogSignature.label }}</strong>
        </p>

        <div v-if="imageDialogSignature.image" class="current-image-row">
          <img
            :src="imageDialogUrl"
            :alt="t('signatures.currentImage')"
            class="signature-preview"
          />
          <div class="current-image-meta">
            <div>{{ imageDialogSignature.image.filename }}</div>
            <div class="muted">{{ imageDialogSignature.image.contentType }}</div>
            <div class="muted">{{ formatBytes(imageDialogSignature.image.sizeBytes) }}</div>
          </div>
        </div>
        <div v-else class="empty-state-small">
          <p>{{ t('signatures.noImageYet') }}</p>
        </div>

        <el-divider />

        <el-form label-width="120px">
          <el-form-item :label="t('signatures.uploadNew')">
            <input
              ref="imageFileInput"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              @change="handleImageFileChange"
            />
            <div class="form-hint">{{ t('signatures.uploadHint') }}</div>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button
          v-if="imageDialogSignature?.image"
          type="danger"
          plain
          :disabled="imageSaving"
          @click="handleDeleteImage"
        >
          {{ t('signatures.removeImage') }}
        </el-button>
        <el-button :disabled="imageSaving" @click="showImageDialog = false">
          {{ t('common.close') }}
        </el-button>
        <el-button
          type="primary"
          :disabled="!pendingImageFile"
          :loading="imageSaving"
          @click="handleUploadImage"
        >
          {{ t('signatures.upload') }}
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { formatDateTime } from '@/utils/dateFormat'
import {
  listMySignatures,
  createMySignature,
  updateMySignature,
  deleteMySignature,
  uploadMySignatureImage,
  deleteMySignatureImage,
  signatureImageUrl,
  type StoredSignature,
  type ElectronicSignaturePayload,
  type DigitalSignaturePayload,
} from '@/api/me-signatures'
import {
  JSF_ASYMMETRIC_ALGORITHMS,
  JSF_ALGORITHM_LABELS,
  type JsfAsymmetricAlgorithm,
} from '@/constants/jsfAlgorithms'

const { t } = useI18n()

const signatures = ref<StoredSignature[]>([])
const warning = ref<string | null>(null)
const loading = ref(false)
const error = ref('')

const saving = ref(false)
const showEditorDialog = ref(false)
const editingId = ref<string | null>(null)

interface EditorForm {
  label: string
  signatureType: 'electronic' | 'digital'
  electronic: {
    name: string
    role: string
    signedName: string
    organizationName: string
    organizationUrl: string
    country: string
    region: string
    locality: string
    streetAddress: string
    postalCode: string
    jurisdiction: string
    legalIntent: string
  }
  digital: {
    signatureFormat: 'jsf' | 'x509'
    signatureAlgorithm: JsfAsymmetricAlgorithm
    publicKeyPem: string
    certificateChain: string
  }
}

// Map pre JSF algorithm identifiers onto the nearest current value so
// stored records from older builds keep rendering cleanly in the
// dropdown. The set is intentionally narrow — only the exact strings
// the legacy UI could produce are mapped; anything else falls back to
// the default.
const LEGACY_ALGORITHM_MAP: Record<string, JsfAsymmetricAlgorithm> = {
  'RSA-SHA256': 'RS256',
  'RSA-SHA384': 'RS384',
  'RSA-SHA512': 'RS512',
  sha256: 'ES256',
  sha384: 'ES384',
  sha512: 'ES512',
  SHA256: 'ES256',
  SHA384: 'ES384',
  SHA512: 'ES512',
}

function coerceLegacyAlgorithm(value: string | null | undefined): JsfAsymmetricAlgorithm {
  if (!value) return 'ES256'
  if ((JSF_ASYMMETRIC_ALGORITHMS as readonly string[]).includes(value)) {
    return value as JsfAsymmetricAlgorithm
  }
  return LEGACY_ALGORITHM_MAP[value] ?? 'ES256'
}

function blankEditor(): EditorForm {
  return {
    label: '',
    signatureType: 'electronic',
    electronic: {
      name: '',
      role: '',
      signedName: '',
      organizationName: '',
      organizationUrl: '',
      country: '',
      region: '',
      locality: '',
      streetAddress: '',
      postalCode: '',
      jurisdiction: '',
      legalIntent: '',
    },
    digital: {
      signatureFormat: 'jsf',
      signatureAlgorithm: 'ES256',
      publicKeyPem: '',
      certificateChain: '',
    },
  }
}

const editorForm = ref<EditorForm>(blankEditor())

// Image dialog state
const showImageDialog = ref(false)
const imageSaving = ref(false)
const imageDialogSignature = ref<StoredSignature | null>(null)
const pendingImageFile = ref<File | null>(null)
const imageFileInput = ref<HTMLInputElement | null>(null)
// Cache-bust param so the preview refreshes after uploads.
const imageCacheBust = ref(0)

const imageDialogUrl = computed(() => {
  if (!imageDialogSignature.value?.image) return ''
  return `${signatureImageUrl(imageDialogSignature.value.id)}?v=${imageCacheBust.value}`
})

async function fetchAll() {
  loading.value = true
  error.value = ''
  try {
    const resp = await listMySignatures()
    signatures.value = resp.data
    warning.value = resp.warning
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || e.message || t('signatures.loadError')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingId.value = null
  editorForm.value = blankEditor()
  showEditorDialog.value = true
}

function openEditDialog(row: StoredSignature) {
  editingId.value = row.id
  const base = blankEditor()
  base.label = row.label
  base.signatureType = row.signatureType

  if (row.signatureType === 'electronic' && row.payload) {
    const p = row.payload as ElectronicSignaturePayload
    base.electronic.name = p.name ?? ''
    base.electronic.role = p.role ?? ''
    base.electronic.signedName = p.signedName ?? ''
    base.electronic.organizationName = p.organization?.name ?? ''
    base.electronic.organizationUrl = p.organization?.url?.[0] ?? ''
    base.electronic.country = p.organization?.address?.country ?? ''
    base.electronic.region = p.organization?.address?.region ?? ''
    base.electronic.locality = p.organization?.address?.locality ?? ''
    base.electronic.streetAddress = p.organization?.address?.streetAddress ?? ''
    base.electronic.postalCode = p.organization?.address?.postalCode ?? ''
    base.electronic.jurisdiction = p.jurisdiction ?? ''
    base.electronic.legalIntent = p.legalIntent ?? ''
  } else if (row.signatureType === 'digital' && row.payload) {
    const p = row.payload as DigitalSignaturePayload
    base.digital.signatureFormat = p.signatureFormat ?? 'jsf'
    // Coerce legacy Node/OpenSSL identifiers (RSA-SHA256, sha256, and
    // friends) onto the closest JSF asymmetric algorithm so existing
    // records round trip through the editor without crashing the
    // dropdown. Unknown values fall back to ES256 and the user can
    // confirm the algorithm at save time.
    base.digital.signatureAlgorithm = coerceLegacyAlgorithm(p.signatureAlgorithm)
    base.digital.publicKeyPem = p.publicKeyPem ?? ''
    base.digital.certificateChain = p.certificateChain ?? ''
  }

  editorForm.value = base
  showEditorDialog.value = true
}

function resetEditor() {
  editingId.value = null
  editorForm.value = blankEditor()
}

function buildElectronicPayload(): ElectronicSignaturePayload {
  const e = editorForm.value.electronic
  const address: Record<string, string> = {}
  if (e.country) address.country = e.country
  if (e.region) address.region = e.region
  if (e.locality) address.locality = e.locality
  if (e.streetAddress) address.streetAddress = e.streetAddress
  if (e.postalCode) address.postalCode = e.postalCode

  const payload: ElectronicSignaturePayload = {
    name: e.name.trim(),
    organization: {
      name: e.organizationName.trim(),
    },
  }
  if (e.role) payload.role = e.role
  if (e.signedName) payload.signedName = e.signedName
  if (e.jurisdiction) payload.jurisdiction = e.jurisdiction
  if (e.legalIntent) payload.legalIntent = e.legalIntent
  if (e.organizationUrl) payload.organization.url = [e.organizationUrl]
  if (Object.keys(address).length > 0) payload.organization.address = address
  return payload
}

function buildDigitalPayload(): DigitalSignaturePayload {
  const d = editorForm.value.digital
  const payload: DigitalSignaturePayload = {
    signatureFormat: d.signatureFormat,
    signatureAlgorithm: d.signatureAlgorithm.trim(),
    publicKeyPem: d.publicKeyPem.trim(),
  }
  if (d.certificateChain.trim()) payload.certificateChain = d.certificateChain.trim()
  return payload
}

async function handleSave() {
  const label = editorForm.value.label.trim()
  if (!label) {
    ElMessage.error(t('signatures.labelRequired'))
    return
  }

  saving.value = true
  try {
    if (editorForm.value.signatureType === 'electronic') {
      const e = editorForm.value.electronic
      if (!e.name.trim()) {
        ElMessage.error(t('signatures.nameRequired'))
        saving.value = false
        return
      }
      if (!e.organizationName.trim()) {
        ElMessage.error(t('signatures.orgNameRequired'))
        saving.value = false
        return
      }
      const payload = buildElectronicPayload()
      if (editingId.value) {
        await updateMySignature(editingId.value, { label, payload })
        ElMessage.success(t('signatures.updateSuccess'))
      } else {
        await createMySignature({ signatureType: 'electronic', label, payload })
        ElMessage.success(t('signatures.createSuccess'))
      }
    } else {
      const d = editorForm.value.digital
      if (!d.publicKeyPem.trim()) {
        ElMessage.error(t('signatures.publicKeyRequired'))
        saving.value = false
        return
      }
      if (!d.signatureAlgorithm.trim()) {
        ElMessage.error(t('signatures.algorithmRequired'))
        saving.value = false
        return
      }
      const payload = buildDigitalPayload()
      if (editingId.value) {
        await updateMySignature(editingId.value, { label, payload })
        ElMessage.success(t('signatures.updateSuccess'))
      } else {
        await createMySignature({ signatureType: 'digital', label, payload })
        ElMessage.success(t('signatures.createSuccess'))
      }
    }

    showEditorDialog.value = false
    await fetchAll()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signatures.saveError'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: StoredSignature) {
  try {
    await ElMessageBox.confirm(
      t('signatures.confirmDelete', { label: row.label }),
      t('common.delete'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  try {
    await deleteMySignature(row.id)
    ElMessage.success(t('signatures.deleteSuccess'))
    await fetchAll()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signatures.deleteError'))
  }
}

function openImageDialog(row: StoredSignature) {
  imageDialogSignature.value = row
  pendingImageFile.value = null
  imageCacheBust.value = Date.now()
  showImageDialog.value = true
}

function resetImageDialog() {
  imageDialogSignature.value = null
  pendingImageFile.value = null
  if (imageFileInput.value) imageFileInput.value.value = ''
}

function handleImageFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  pendingImageFile.value = target.files?.[0] ?? null
}

async function handleUploadImage() {
  if (!imageDialogSignature.value || !pendingImageFile.value) return
  const file = pendingImageFile.value

  imageSaving.value = true
  try {
    const base64 = await readFileAsBase64(file)
    await uploadMySignatureImage(imageDialogSignature.value.id, {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      binaryContent: base64,
    })
    ElMessage.success(t('signatures.imageUploaded'))
    await fetchAll()
    // Refresh the dialog's backing row so the preview updates without
    // closing the dialog.
    const fresh = signatures.value.find((s) => s.id === imageDialogSignature.value?.id)
    if (fresh) imageDialogSignature.value = fresh
    imageCacheBust.value = Date.now()
    pendingImageFile.value = null
    if (imageFileInput.value) imageFileInput.value.value = ''
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signatures.uploadError'))
  } finally {
    imageSaving.value = false
  }
}

async function handleDeleteImage() {
  if (!imageDialogSignature.value) return

  try {
    await ElMessageBox.confirm(
      t('signatures.confirmRemoveImage'),
      t('signatures.removeImage'),
      {
        confirmButtonText: t('signatures.removeImage'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  imageSaving.value = true
  try {
    await deleteMySignatureImage(imageDialogSignature.value.id)
    ElMessage.success(t('signatures.imageRemoved'))
    await fetchAll()
    const fresh = signatures.value.find((s) => s.id === imageDialogSignature.value?.id)
    if (fresh) imageDialogSignature.value = fresh
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('signatures.imageRemoveError'))
  } finally {
    imageSaving.value = false
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'))
        return
      }
      // result looks like "data:image/png;base64,AAA..."; strip the
      // prefix so the backend receives pure base64 content.
      const idx = result.indexOf('base64,')
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function electronicIdentityLine(row: StoredSignature): string {
  if (row.signatureType !== 'electronic' || !row.payload) return ''
  const p = row.payload as ElectronicSignaturePayload
  const parts: string[] = []
  if (p.name) parts.push(p.name)
  if (p.role) parts.push(p.role)
  if (p.organization?.name) parts.push(p.organization.name)
  return parts.join(' / ')
}

function shortFingerprint(fp: string | null): string {
  if (!fp) return '-'
  return fp.length > 16 ? `${fp.slice(0, 8)}\u2026${fp.slice(-8)}` : fp
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

onMounted(fetchAll)
</script>

<style scoped lang="scss">
.signatures-card {
  width: 100%;
}

.signatures-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cat-spacing-3);
}

.signatures-warning {
  margin-bottom: var(--cat-spacing-3);
}

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

.empty-state-small {
  text-align: center;
  padding: var(--cat-spacing-4);
  color: var(--cat-text-tertiary);

  p {
    margin: 0;
  }
}

.form-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: 4px;
}

.fingerprint-cell {
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
}

.muted {
  color: var(--cat-text-tertiary);
}

.image-subtitle {
  margin-top: 0;
  margin-bottom: var(--cat-spacing-3);
}

.current-image-row {
  display: flex;
  gap: var(--cat-spacing-4);
  align-items: center;
  padding: var(--cat-spacing-3);
  background: var(--cat-surface-muted, transparent);
  border: 1px solid var(--cat-border-color, transparent);
  border-radius: 4px;
}

.signature-preview {
  max-width: 160px;
  max-height: 80px;
  background: #ffffff;
  border: 1px solid var(--cat-border-color, #d1d5db);
  border-radius: 4px;
  padding: 4px;
  object-fit: contain;
}

.current-image-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--cat-font-size-sm);
}

.w-240 {
  width: 240px;
}
</style>
