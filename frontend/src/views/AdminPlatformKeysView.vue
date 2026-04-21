<template>
  <div class="admin-platform-keys-container">
    <PageHeader
      :title="t('platformKeys.title')"
      :subtitle="t('platformKeys.subtitle')"
    >
      <template #actions>
        <el-button
          v-if="canRotate"
          type="primary"
          :loading="rotating"
          @click="showRotateDialog = true"
        >
          {{ t('platformKeys.rotate') }}
        </el-button>
      </template>
    </PageHeader>

    <div class="admin-platform-keys-content">
      <div v-if="loading" class="loading-container" role="status" aria-live="polite">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert
          :title="t('common.error')"
          :description="error"
          type="error"
          :closable="false"
        />
        <el-button @click="fetchKeys" class="retry-button">
          {{ t('common.retry') }}
        </el-button>
      </div>

      <template v-else>
        <div v-if="activeKey" class="status-card">
          <div class="status-card-header">
            <h3>{{ t('platformKeys.activeHeading') }}</h3>
            <span class="status-badge status-badge--active">
              {{ t('platformKeys.active') }}
            </span>
          </div>

          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">{{ t('platformKeys.algorithm') }}</span>
              <span class="status-value">{{ activeKey.algorithm }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">{{ t('platformKeys.fingerprint') }}</span>
              <span class="status-value fingerprint-value">{{ activeKey.fingerprint }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">{{ t('platformKeys.rotatedAt') }}</span>
              <span class="status-value">
                {{ activeKey.rotatedAt ? formatTimestamp(activeKey.rotatedAt) : t('common.na') }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">{{ t('platformKeys.createdAt') }}</span>
              <span class="status-value">{{ formatTimestamp(activeKey.createdAt) }}</span>
            </div>
          </div>

          <div class="pem-block">
            <div class="pem-header">
              <span class="status-label">{{ t('platformKeys.publicKey') }}</span>
              <el-button size="small" @click="copyPem(activeKey.publicKeyPem)">
                {{ t('platformKeys.copyPublicKey') }}
              </el-button>
            </div>
            <pre class="pem-value">{{ activeKey.publicKeyPem }}</pre>
          </div>
        </div>

        <div class="status-card">
          <div class="status-card-header">
            <h3>{{ t('platformKeys.historyHeading') }}</h3>
          </div>

          <div v-if="keys.length === 0" class="empty-message">
            {{ t('platformKeys.empty') }}
          </div>

          <el-table
            v-else
            :data="keys"
            stripe
            border
            :aria-label="t('platformKeys.tableLabel')"
          >
            <el-table-column
              prop="fingerprint"
              :label="t('platformKeys.fingerprint')"
              min-width="280"
            >
              <template #default="{ row }">
                <code class="fingerprint-cell">{{ row.fingerprint }}</code>
              </template>
            </el-table-column>
            <el-table-column
              prop="algorithm"
              :label="t('platformKeys.algorithm')"
              width="140"
            />
            <el-table-column
              :label="t('common.status')"
              width="120"
            >
              <template #default="{ row }">
                <span
                  class="status-badge"
                  :class="row.isActive ? 'status-badge--active' : 'status-badge--inactive'"
                >
                  {{ row.isActive ? t('platformKeys.active') : t('platformKeys.retired') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column
              prop="rotatedAt"
              :label="t('platformKeys.rotatedAt')"
              min-width="180"
            >
              <template #default="{ row }">
                {{ row.rotatedAt ? formatTimestamp(row.rotatedAt) : '-' }}
              </template>
            </el-table-column>
            <el-table-column
              prop="createdAt"
              :label="t('platformKeys.createdAt')"
              min-width="180"
            >
              <template #default="{ row }">
                {{ formatTimestamp(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </div>

    <el-dialog
      v-model="showRotateDialog"
      :title="t('platformKeys.rotateConfirmTitle')"
      width="520px"
    >
      <p>{{ t('platformKeys.rotateConfirmDesc') }}</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('platformKeys.algorithmLabel')">
          <el-select
            v-model="rotateAlgorithm"
            :placeholder="t('platformKeys.algorithmPlaceholder')"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="algo in JSF_ASYMMETRIC_ALGORITHMS"
              :key="algo"
              :value="algo"
              :label="JSF_ALGORITHM_LABELS[algo]"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRotateDialog = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="rotating"
          @click="performRotate"
        >
          {{ t('platformKeys.rotate') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { formatTimestamp } from '@/utils/dateFormat'
import {
  listPlatformKeys,
  rotatePlatformKey,
  type PlatformKeyPublic,
  type PlatformKeyAlgorithm,
} from '@/api/platform-keys'
import {
  JSF_ASYMMETRIC_ALGORITHMS,
  JSF_ALGORITHM_LABELS,
} from '@/constants/jsfAlgorithms'

const { t } = useI18n()
const authStore = useAuthStore()

const keys = ref<PlatformKeyPublic[]>([])
const loading = ref(false)
const error = ref('')
const rotating = ref(false)
const showRotateDialog = ref(false)
const rotateAlgorithm = ref<PlatformKeyAlgorithm | ''>('')

const canRotate = computed(() => authStore.hasPermission('platform_keys.rotate'))

const activeKey = computed(() => keys.value.find((k) => k.isActive) || null)

async function fetchKeys() {
  loading.value = true
  error.value = ''
  try {
    keys.value = await listPlatformKeys()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || e.message || t('platformKeys.loadError')
  } finally {
    loading.value = false
  }
}

async function performRotate() {
  if (!canRotate.value) {
    ElMessage.error(t('common.forbidden'))
    return
  }
  rotating.value = true
  try {
    await rotatePlatformKey(rotateAlgorithm.value || undefined)
    ElMessage.success(t('platformKeys.rotateSuccess'))
    showRotateDialog.value = false
    rotateAlgorithm.value = ''
    await fetchKeys()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('platformKeys.rotateError'))
  } finally {
    rotating.value = false
  }
}

async function copyPem(pem: string) {
  try {
    await navigator.clipboard.writeText(pem)
    ElMessage.success(t('platformKeys.copied'))
  } catch {
    ElMessage.error(t('common.error'))
  }
}

onMounted(fetchKeys)
</script>

<style scoped lang="scss">
.admin-platform-keys-container {
  padding: 0;
}

.admin-platform-keys-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
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

.fingerprint-value,
.fingerprint-cell {
  font-family: var(--cat-font-mono);
  word-break: break-all;
}

.fingerprint-cell {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
}

.pem-block {
  padding: 0 var(--cat-spacing-4) var(--cat-spacing-4);
}

.pem-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--cat-spacing-2);
}

.pem-value {
  margin: 0;
  padding: var(--cat-spacing-3);
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow: auto;
}

.empty-message {
  padding: var(--cat-spacing-4);
  color: var(--cat-text-secondary);
  text-align: center;
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

  &--inactive {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }
}
</style>
