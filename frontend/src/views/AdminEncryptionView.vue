<template>
  <div class="admin-encryption-container">
    <PageHeader :title="t('encryption.title')" :subtitle="t('encryption.subtitle')">
      <template #actions>
        <el-button
          v-if="canRotate"
          type="primary"
          :disabled="!status?.available || rotating"
          :loading="rotating"
          @click="confirmRotate"
        >
          {{ t('encryption.rotateKey') }}
        </el-button>
      </template>
    </PageHeader>

    <div class="admin-encryption-content">
      <div v-if="loading" class="loading-container" role="status" aria-live="polite">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchStatus" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else-if="status">
        <el-alert
          v-if="status.passthroughMode"
          :title="t('encryption.passthroughTitle')"
          :description="t('encryption.passthroughDesc')"
          type="warning"
          show-icon
          :closable="false"
          class="encryption-alert"
        />

        <div class="status-card">
          <div class="status-card-header">
            <h3>{{ t('encryption.statusHeading') }}</h3>
            <span
              class="status-badge"
              :class="status.available ? 'status-badge--active' : 'status-badge--disabled'"
            >
              {{ status.available ? t('encryption.enabled') : t('encryption.disabled') }}
            </span>
          </div>

          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">{{ t('encryption.activeVersion') }}</span>
              <span class="status-value">
                {{ status.activeKeyVersion !== null ? `v${status.activeKeyVersion}` : t('common.notSet') }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">{{ t('encryption.totalVersions') }}</span>
              <span class="status-value">{{ status.keyVersions.length }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">{{ t('encryption.lastRotation') }}</span>
              <span class="status-value">{{ lastRotationLabel }}</span>
            </div>
          </div>
        </div>

        <div class="status-card">
          <div class="status-card-header">
            <h3>{{ t('encryption.fieldsHeading') }}</h3>
          </div>

          <el-table :data="fieldRows" stripe border>
            <el-table-column prop="name" :label="t('encryption.fieldName')" min-width="180" />
            <el-table-column prop="total" :label="t('encryption.total')" min-width="100" align="right" />
            <el-table-column prop="encrypted" :label="t('encryption.encrypted')" min-width="120" align="right">
              <template #default="{ row }">
                <span class="status-badge status-badge--active">{{ row.encrypted }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="plaintext" :label="t('encryption.plaintext')" min-width="120" align="right">
              <template #default="{ row }">
                <span
                  class="status-badge"
                  :class="row.plaintext > 0 ? 'status-badge--warning' : 'status-badge--inactive'"
                >
                  {{ row.plaintext }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="status.keyVersions.length > 0" class="status-card">
          <div class="status-card-header">
            <h3>{{ t('encryption.versionsHeading') }}</h3>
          </div>

          <el-table :data="status.keyVersions" stripe border>
            <el-table-column prop="version" :label="t('encryption.version')" width="120">
              <template #default="{ row }">
                <code class="version-cell">v{{ row.version }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="isActive" :label="t('common.status')" width="120">
              <template #default="{ row }">
                <span
                  class="status-badge"
                  :class="row.isActive ? 'status-badge--active' : 'status-badge--inactive'"
                >
                  {{ row.isActive ? t('encryption.active') : t('encryption.retired') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" :label="t('encryption.createdAt')" min-width="180">
              <template #default="{ row }">
                {{ formatTimestamp(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column prop="retiredAt" :label="t('encryption.retiredAt')" min-width="180">
              <template #default="{ row }">
                {{ row.retiredAt ? formatTimestamp(row.retiredAt) : '-' }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { formatTimestamp } from '@/utils/dateFormat'
import {
  getEncryptionStatus,
  rotateEncryptionKey,
  type EncryptionStatus,
} from '@/api/encryption'

const { t } = useI18n()
const authStore = useAuthStore()

const status = ref<EncryptionStatus | null>(null)
const loading = ref(false)
const error = ref('')
const rotating = ref(false)

// Mid session permission revocations only take effect on the next
// route change, so we double gate the rotate button here as well.
const canRotate = computed(() => authStore.hasPermission('admin.encryption'))

const fieldRows = computed(() => {
  if (!status.value) return []
  return [
    {
      name: t('encryption.webhookSecrets'),
      total: status.value.encryptedFields.webhook.total,
      encrypted: status.value.encryptedFields.webhook.encrypted,
      plaintext: status.value.encryptedFields.webhook.plaintext,
    },
  ]
})

const lastRotationLabel = computed(() => {
  if (!status.value || status.value.keyVersions.length === 0) {
    return t('common.notSet')
  }
  // Versions are returned newest first by the backend; the createdAt
  // of the active version is the most recent rotation event.
  const active = status.value.keyVersions.find((v) => v.isActive) ?? status.value.keyVersions[0]
  return formatTimestamp(active.createdAt)
})

async function fetchStatus() {
  loading.value = true
  error.value = ''
  try {
    status.value = await getEncryptionStatus()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || e.message || t('encryption.loadError')
  } finally {
    loading.value = false
  }
}

async function confirmRotate() {
  if (!canRotate.value) {
    ElMessage.error(t('common.forbidden'))
    return
  }
  if (!status.value?.available) {
    ElMessage.warning(t('encryption.unavailableWarning'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('encryption.rotateConfirmDesc'),
      t('encryption.rotateConfirmTitle'),
      {
        confirmButtonText: t('encryption.rotateKey'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  rotating.value = true
  try {
    const result = await rotateEncryptionKey()
    ElMessage.success(
      t('encryption.rotateSuccess', {
        newVersion: result.newVersion,
        rekeyed: result.rekeyed,
      }),
    )
    await fetchStatus()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('encryption.rotateError'))
  } finally {
    rotating.value = false
  }
}

onMounted(fetchStatus)
</script>

<style scoped lang="scss">
.admin-encryption-container {
  padding: 0;
}

.admin-encryption-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
}

.encryption-alert {
  margin-bottom: var(--cat-spacing-2);
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
  padding: var(--cat-spacing-3) 0;

  .retry-button {
    margin-top: 16px;
  }
}

.status-card {
  background: var(--cat-bg-primary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  overflow: hidden;
}

.status-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cat-spacing-3) var(--cat-spacing-4);
  background: var(--cat-bg-secondary);
  border-bottom: 1px solid var(--cat-border-default);

  h3 {
    margin: 0;
    font-size: var(--cat-font-size-md);
    font-weight: var(--cat-font-weight-semibold);
    color: var(--cat-text-primary);
  }
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-4);
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-label {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-value {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-primary);
  font-weight: var(--cat-font-weight-medium);
}

.version-cell {
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  line-height: 1.6;
  white-space: nowrap;

  &--active {
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
  }

  &--disabled {
    background-color: rgba(248, 81, 73, 0.15);
    color: #f85149;
  }

  &--inactive {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }

  &--warning {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }
}
</style>
