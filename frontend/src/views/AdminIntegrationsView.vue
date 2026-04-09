<template>
  <div class="admin-integrations-container">
    <PageHeader :title="t('integrations.title')" :subtitle="t('integrations.subtitle')" />

    <div class="admin-integrations-content">
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchStatus" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <!-- SMTP / Email Card -->
        <div class="integration-card">
          <div class="integration-card-header">
            <div class="integration-card-title">
              <el-icon :size="20"><Message /></el-icon>
              <h3>{{ t('integrations.smtp.title') }}</h3>
            </div>
            <span class="status-badge" :class="status.smtp?.enabled ? 'status-badge--active' : 'status-badge--disabled'">
              {{ status.smtp?.enabled ? t('common.active') : t('common.inactive') }}
            </span>
          </div>

          <div v-if="status.smtp?.enabled" class="integration-card-body">
            <div class="config-grid">
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.host') }}</span>
                <span class="config-value">{{ status.smtp.host || t('common.notSet') }}</span>
              </div>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.port') }}</span>
                <span class="config-value">{{ status.smtp.port }}</span>
              </div>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.security') }}</span>
                <span class="config-value">{{ status.smtp.secure ? 'TLS (implicit)' : 'STARTTLS' }}</span>
              </div>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.from') }}</span>
                <span class="config-value">{{ status.smtp.from || t('common.notSet') }}</span>
              </div>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.username') }}</span>
                <span class="config-value">{{ status.smtp.userConfigured ? t('integrations.configured') : t('integrations.notConfigured') }}</span>
              </div>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.smtp.password') }}</span>
                <span class="config-value">
                  <el-icon v-if="status.smtp.passConfigured" :size="14"><Lock /></el-icon>
                  {{ status.smtp.passConfigured ? t('integrations.configured') : t('integrations.notConfigured') }}
                </span>
              </div>
            </div>

            <div class="integration-card-actions">
              <el-button
                type="primary"
                :loading="testingSmtp"
                @click="testSmtp"
              >
                {{ t('integrations.smtp.testConnection') }}
              </el-button>
              <span v-if="smtpTestResult" class="test-result" :class="smtpTestResult.success ? 'test-result--success' : 'test-result--error'">
                {{ smtpTestResult.message }}
              </span>
            </div>
          </div>

          <div v-else class="integration-card-body">
            <p class="integration-hint">{{ t('integrations.smtp.notConfiguredHint') }}</p>
            <el-collapse>
              <el-collapse-item :title="t('integrations.smtp.setupGuide')">
                <div class="setup-guide">
                  <p>{{ t('integrations.smtp.setupGuideIntro') }}</p>
                  <pre class="env-example">SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM="Assessors Studio" &lt;noreply@example.com&gt;
SMTP_TLS_REJECT_UNAUTHORIZED=true</pre>
                  <p class="provider-examples-title">{{ t('integrations.smtp.providerExamples') }}</p>
                  <div class="provider-example">
                    <strong>Amazon SES:</strong> SMTP_HOST=email-smtp.us-east-1.amazonaws.com, SMTP_PORT=587
                  </div>
                  <div class="provider-example">
                    <strong>SendGrid:</strong> SMTP_HOST=smtp.sendgrid.net, SMTP_PORT=587, SMTP_USER=apikey
                  </div>
                  <div class="provider-example">
                    <strong>Gmail SMTP Relay:</strong> SMTP_HOST=smtp.gmail.com, SMTP_PORT=587
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>

        <!-- Storage Card -->
        <div class="integration-card">
          <div class="integration-card-header">
            <div class="integration-card-title">
              <el-icon :size="20"><FolderOpened /></el-icon>
              <h3>{{ t('integrations.storage.title') }}</h3>
            </div>
            <span class="status-badge status-badge--active">
              {{ status.storage?.provider === 's3' ? 'S3' : t('integrations.storage.database') }}
            </span>
          </div>

          <div class="integration-card-body">
            <div class="config-grid">
              <div class="config-item">
                <span class="config-label">{{ t('integrations.storage.provider') }}</span>
                <span class="config-value">{{ status.storage?.provider === 's3' ? 'S3 Compatible' : 'Database' }}</span>
              </div>
              <template v-if="status.storage?.provider === 's3' && status.storage.s3">
                <div class="config-item">
                  <span class="config-label">{{ t('integrations.storage.bucket') }}</span>
                  <span class="config-value">{{ status.storage.s3.bucket }}</span>
                </div>
                <div class="config-item">
                  <span class="config-label">{{ t('integrations.storage.region') }}</span>
                  <span class="config-value">{{ status.storage.s3.region }}</span>
                </div>
                <div class="config-item">
                  <span class="config-label">{{ t('integrations.storage.endpoint') }}</span>
                  <span class="config-value">{{ status.storage.s3.endpoint || t('integrations.storage.defaultEndpoint') }}</span>
                </div>
                <div class="config-item">
                  <span class="config-label">{{ t('integrations.storage.accessKey') }}</span>
                  <span class="config-value">{{ status.storage.s3.accessKeyConfigured ? t('integrations.configured') : t('integrations.notConfigured') }}</span>
                </div>
              </template>
              <div class="config-item">
                <span class="config-label">{{ t('integrations.storage.maxFileSize') }}</span>
                <span class="config-value">{{ formatFileSize(status.storage?.maxFileSize) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Webhook Card -->
        <div class="integration-card">
          <div class="integration-card-header">
            <div class="integration-card-title">
              <el-icon :size="20"><Connection /></el-icon>
              <h3>{{ t('integrations.webhook.title') }}</h3>
            </div>
            <span class="status-badge" :class="status.webhook?.enabled ? 'status-badge--active' : 'status-badge--disabled'">
              {{ status.webhook?.enabled ? t('common.active') : t('common.inactive') }}
            </span>
          </div>

          <div class="integration-card-body">
            <p v-if="status.webhook?.enabled" class="integration-hint">
              {{ t('integrations.webhook.enabledHint') }}
            </p>
            <p v-else class="integration-hint">
              {{ t('integrations.webhook.disabledHint') }}
            </p>
            <div v-if="status.webhook?.enabled" class="integration-card-actions">
              <RouterLink to="/admin/webhooks">
                <el-button type="primary" plain>{{ t('integrations.webhook.manageWebhooks') }}</el-button>
              </RouterLink>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import PageHeader from '@/components/shared/PageHeader.vue'
import {
  Message,
  FolderOpened,
  Connection,
  Lock,
  Loading,
} from '@element-plus/icons-vue'

const { t } = useI18n()

const loading = ref(true)
const error = ref<string | null>(null)
const testingSmtp = ref(false)
const smtpTestResult = ref<{ success: boolean; message: string } | null>(null)

interface IntegrationStatus {
  storage: {
    provider: string
    maxFileSize: number
    s3?: {
      bucket: string
      region: string
      endpoint: string | null
      accessKeyConfigured: boolean
      forcePathStyle: boolean
    }
  }
  smtp: {
    enabled: boolean
    host: string | null
    port: number
    secure: boolean
    from: string | null
    userConfigured: boolean
    passConfigured: boolean
    tlsRejectUnauthorized: boolean
  }
  webhook: {
    enabled: boolean
  }
}

const status = ref<Partial<IntegrationStatus>>({})

async function fetchStatus() {
  loading.value = true
  error.value = null
  try {
    const { data } = await axios.get('/api/v1/admin/integrations/status')
    status.value = data
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to load integration status'
  } finally {
    loading.value = false
  }
}

async function testSmtp() {
  testingSmtp.value = true
  smtpTestResult.value = null
  try {
    const { data } = await axios.post('/api/v1/admin/integrations/test/smtp')
    smtpTestResult.value = { success: true, message: data.message }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'SMTP test failed'
    smtpTestResult.value = { success: false, message: msg }
  } finally {
    testingSmtp.value = false
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'N/A'
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

onMounted(fetchStatus)
</script>

<style scoped lang="scss">
.admin-integrations-container {
  padding: var(--cat-spacing-4);
  max-width: 900px;
}

.admin-integrations-content {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
}

.loading-container {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  padding: var(--cat-spacing-6);
  color: var(--cat-text-secondary);
}

.error-container {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.retry-button {
  align-self: flex-start;
}

.integration-card {
  background: var(--cat-bg-primary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  overflow: hidden;
}

.integration-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cat-spacing-3) var(--cat-spacing-4);
  background: var(--cat-bg-secondary);
  border-bottom: 1px solid var(--cat-border-default);
}

.integration-card-title {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);

  h3 {
    margin: 0;
    font-size: var(--cat-font-size-md);
    font-weight: var(--cat-font-weight-semibold);
    color: var(--cat-text-primary);
  }
}

.integration-card-body {
  padding: var(--cat-spacing-4);
}

.integration-card-actions {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
  margin-top: var(--cat-spacing-4);
  padding-top: var(--cat-spacing-3);
  border-top: 1px solid var(--cat-border-default);
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--cat-spacing-3);
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-label {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.config-value {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--cat-radius-full);
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-semibold);
}

.status-badge--active {
  background-color: var(--el-color-success-light-9, #f0f9eb);
  color: var(--el-color-success, #67c23a);
}

.status-badge--disabled {
  background-color: var(--el-color-info-light-9, #f4f4f5);
  color: var(--el-color-info, #909399);
}

.integration-hint {
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
  margin: 0 0 var(--cat-spacing-2);
}

.test-result {
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-medium);
}

.test-result--success {
  color: var(--el-color-success, #67c23a);
}

.test-result--error {
  color: var(--el-color-danger, #f56c6c);
}

.setup-guide {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
}

.env-example {
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  padding: var(--cat-spacing-3);
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-xs);
  white-space: pre-wrap;
  overflow-x: auto;
  margin: var(--cat-spacing-2) 0;
}

.provider-examples-title {
  font-weight: var(--cat-font-weight-semibold);
  margin-top: var(--cat-spacing-3);
  margin-bottom: var(--cat-spacing-1);
}

.provider-example {
  font-size: var(--cat-font-size-xs);
  padding: var(--cat-spacing-1) 0;
  color: var(--cat-text-secondary);
}
</style>
