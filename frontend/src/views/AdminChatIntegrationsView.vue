<template>
  <div class="chat-integrations-container">
    <PageHeader :title="t('chatIntegrations.title')" :subtitle="t('chatIntegrations.subtitle')" />

    <!-- Platform tabs -->
    <el-tabs v-model="activePlatform" class="platform-tabs" @tab-change="fetchIntegrations">
      <el-tab-pane
        v-for="p in platforms"
        :key="p.key"
        :label="p.label"
        :name="p.key"
      />
    </el-tabs>

    <div class="chat-integrations-content">
      <!-- Loading -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchIntegrations" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <!-- Actions bar -->
        <div class="actions-bar">
          <el-button type="primary" @click="openCreateDialog">
            {{ t('chatIntegrations.create') }}
          </el-button>
        </div>

        <!-- Empty state -->
        <div v-if="integrations.length === 0" class="empty-state">
          <p>{{ t('chatIntegrations.noIntegrations', { platform: currentPlatformLabel }) }}</p>
          <el-collapse>
            <el-collapse-item :title="t('chatIntegrations.setupGuide')">
              <div class="setup-guide">
                <div v-if="activePlatform === 'slack'">
                  <p>{{ t('chatIntegrations.slackSetupGuide') }}</p>
                  <pre class="env-example">SLACK_ENABLED=true</pre>
                </div>
                <div v-else-if="activePlatform === 'teams'">
                  <p>{{ t('chatIntegrations.teamsSetupGuide') }}</p>
                  <pre class="env-example">TEAMS_ENABLED=true</pre>
                </div>
                <div v-else-if="activePlatform === 'mattermost'">
                  <p>{{ t('chatIntegrations.mattermostSetupGuide') }}</p>
                  <pre class="env-example">MATTERMOST_ENABLED=true</pre>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Integration table -->
        <el-table v-else :data="integrations" class="integrations-table" stripe>
          <el-table-column prop="name" :label="t('chatIntegrations.name')" min-width="180" />
          <el-table-column prop="channelName" :label="t('chatIntegrations.channelName')" min-width="140">
            <template #default="{ row }">{{ row.channelName || row.channel_name || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('chatIntegrations.categories')" min-width="200">
            <template #default="{ row }">
              <div class="category-tags">
                <el-tag
                  v-for="cat in parseCategories(row.eventCategories || row.event_categories)"
                  :key="cat"
                  size="small"
                  type="info"
                >{{ cat }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="120">
            <template #default="{ row }">
              <span class="status-badge" :class="(row.isActive ?? row.is_active) ? 'status-badge--active' : 'status-badge--disabled'">
                {{ (row.isActive ?? row.is_active) ? t('common.active') : t('common.inactive') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="240" align="right">
            <template #default="{ row }">
              <el-button size="small" @click="testIntegration(row)">
                {{ t('chatIntegrations.sendTest') }}
              </el-button>
              <el-button
                v-if="!(row.isActive ?? row.is_active)"
                size="small"
                type="success"
                @click="enableIntegration(row)"
              >
                {{ t('chatIntegrations.enable') }}
              </el-button>
              <el-button size="small" @click="openEditDialog(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-button size="small" type="danger" @click="confirmDelete(row)">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- Delivery log expand for selected integration -->
        <div v-if="selectedIntegration" class="delivery-log-section">
          <h4>{{ t('chatIntegrations.deliveryLog') }}: {{ selectedIntegration.name }}</h4>
          <el-button size="small" @click="selectedIntegration = null">{{ t('common.close') }}</el-button>
          <el-table :data="deliveries" class="delivery-table" stripe size="small">
            <el-table-column prop="event_type" :label="t('chatIntegrations.eventType')" min-width="180" />
            <el-table-column prop="status" :label="t('common.status')" width="100">
              <template #default="{ row }">
                <el-tag :type="deliveryStatusType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="http_status" :label="t('webhooks.httpStatus')" width="100" />
            <el-table-column prop="attempt" :label="t('webhooks.attempt')" width="80" />
            <el-table-column prop="error_message" :label="t('webhooks.errorMessage')" min-width="200">
              <template #default="{ row }">{{ row.error_message || '—' }}</template>
            </el-table-column>
            <el-table-column prop="created_at" :label="t('webhooks.timestamp')" width="180">
              <template #default="{ row }">{{ formatDate(row.created_at || row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div v-if="deliveryPagination.total > deliveryPagination.limit" class="pagination-bar">
            <el-pagination
              layout="prev, pager, next"
              :total="deliveryPagination.total"
              :page-size="deliveryPagination.limit"
              :current-page="deliveryPage"
              @current-change="onDeliveryPageChange"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('chatIntegrations.editTitle') : t('chatIntegrations.createTitle')"
      width="520px"
    >
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('chatIntegrations.name')" required>
          <el-input v-model="form.name" :placeholder="t('chatIntegrations.namePlaceholder')" />
        </el-form-item>
        <el-form-item v-if="!editingId" :label="t('chatIntegrations.platform')" required>
          <el-select v-model="form.platform" style="width: 100%">
            <el-option v-for="p in platforms" :key="p.key" :label="p.label" :value="p.key" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('chatIntegrations.webhookUrl')" required>
          <el-input v-model="form.webhookUrl" :placeholder="webhookUrlPlaceholder" />
          <div class="form-hint">{{ webhookUrlHint }}</div>
        </el-form-item>
        <el-form-item :label="t('chatIntegrations.channelName')">
          <el-input v-model="form.channelName" :placeholder="t('chatIntegrations.channelNamePlaceholder')" />
          <div class="form-hint">{{ t('chatIntegrations.channelNameHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('chatIntegrations.categories')" required>
          <el-checkbox-group v-model="form.eventCategories">
            <el-checkbox v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveIntegration">
          {{ editingId ? t('common.save') : t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Test result notification -->
    <el-dialog v-model="testResultVisible" :title="t('chatIntegrations.testResult')" width="400px">
      <el-result
        :icon="testResult?.success ? 'success' : 'error'"
        :title="testResult?.success ? t('chatIntegrations.testSuccess') : t('chatIntegrations.testFailed')"
        :sub-title="testResult?.message"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/shared/PageHeader.vue'
import { Loading } from '@element-plus/icons-vue'

const { t } = useI18n()

const platforms = [
  { key: 'slack', label: 'Slack' },
  { key: 'teams', label: 'Microsoft Teams' },
  { key: 'mattermost', label: 'Mattermost' },
]

const availableCategories = ['assessment', 'evidence', 'claim', 'attestation', 'project', 'standard', 'system']

const activePlatform = ref('slack')
const loading = ref(true)
const error = ref<string | null>(null)
const integrations = ref<any[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const testResultVisible = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const selectedIntegration = ref<any | null>(null)
const deliveries = ref<any[]>([])
const deliveryPage = ref(1)
const deliveryPagination = ref({ limit: 20, offset: 0, total: 0 })

const form = ref({
  name: '',
  platform: 'slack',
  webhookUrl: '',
  channelName: '',
  eventCategories: ['assessment', 'evidence', 'attestation'] as string[],
})

const currentPlatformLabel = computed(() => {
  return platforms.find((p) => p.key === activePlatform.value)?.label || activePlatform.value
})

const webhookUrlPlaceholder = computed(() => {
  const p = form.value.platform || activePlatform.value
  if (p === 'slack') return 'https://hooks.slack.com/services/...'
  if (p === 'teams') return 'https://xxx.webhook.office.com/...'
  return 'https://mattermost.example.com/hooks/...'
})

const webhookUrlHint = computed(() => {
  const p = form.value.platform || activePlatform.value
  if (p === 'slack') return t('chatIntegrations.slackUrlHint')
  if (p === 'teams') return t('chatIntegrations.teamsUrlHint')
  return t('chatIntegrations.mattermostUrlHint')
})

function parseCategories(cats: string | string[] | undefined): string[] {
  if (!cats) return []
  if (Array.isArray(cats)) return cats
  try {
    const parsed = JSON.parse(cats)
    if (Array.isArray(parsed)) return parsed
  } catch { /* not JSON */ }
  return cats.split(',').map((c: string) => c.trim()).filter(Boolean)
}

function deliveryStatusType(status: string): string {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'warning'
  if (status === 'exhausted') return 'danger'
  return 'info'
}

function formatDate(d: string | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

async function fetchIntegrations() {
  loading.value = true
  error.value = null
  selectedIntegration.value = null
  try {
    const { data } = await axios.get('/api/v1/integrations/chat', {
      params: { platform: activePlatform.value },
    })
    integrations.value = data.data || []
  } catch (err: any) {
    error.value = err?.response?.data?.error || err?.message || 'Failed to load integrations'
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingId.value = null
  form.value = {
    name: '',
    platform: activePlatform.value,
    webhookUrl: '',
    channelName: '',
    eventCategories: ['assessment', 'evidence', 'attestation'],
  }
  dialogVisible.value = true
}

function openEditDialog(row: any) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    platform: row.platform,
    webhookUrl: row.webhookUrl || row.webhook_url || '',
    channelName: row.channelName || row.channel_name || '',
    eventCategories: parseCategories(row.eventCategories || row.event_categories),
  }
  dialogVisible.value = true
}

async function saveIntegration() {
  saving.value = true
  try {
    if (editingId.value) {
      await axios.put(`/api/v1/integrations/chat/${editingId.value}`, {
        name: form.value.name,
        webhookUrl: form.value.webhookUrl,
        channelName: form.value.channelName || null,
        eventCategories: form.value.eventCategories,
      })
      ElMessage.success(t('chatIntegrations.updated'))
    } else {
      await axios.post('/api/v1/integrations/chat', {
        name: form.value.name,
        platform: form.value.platform,
        webhookUrl: form.value.webhookUrl,
        channelName: form.value.channelName || undefined,
        eventCategories: form.value.eventCategories,
      })
      ElMessage.success(t('chatIntegrations.created'))
    }
    dialogVisible.value = false
    await fetchIntegrations()
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Save failed'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

async function testIntegration(row: any) {
  try {
    const { data } = await axios.post(`/api/v1/integrations/chat/${row.id}/test`)
    testResult.value = data
    testResultVisible.value = true
  } catch (err: any) {
    testResult.value = {
      success: false,
      message: err?.response?.data?.message || err?.message || 'Test failed',
    }
    testResultVisible.value = true
  }
}

async function enableIntegration(row: any) {
  try {
    await axios.post(`/api/v1/integrations/chat/${row.id}/enable`)
    ElMessage.success(t('chatIntegrations.enabled'))
    await fetchIntegrations()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || 'Failed to enable')
  }
}

async function confirmDelete(row: any) {
  try {
    await ElMessageBox.confirm(
      t('chatIntegrations.deleteConfirm', { name: row.name }),
      t('common.confirm'),
      { type: 'warning' },
    )
    await axios.delete(`/api/v1/integrations/chat/${row.id}`)
    ElMessage.success(t('chatIntegrations.deleted'))
    await fetchIntegrations()
  } catch {
    // cancelled
  }
}

async function fetchDeliveries() {
  if (!selectedIntegration.value) return
  const offset = (deliveryPage.value - 1) * deliveryPagination.value.limit
  try {
    const { data } = await axios.get(
      `/api/v1/integrations/chat/${selectedIntegration.value.id}/deliveries`,
      { params: { limit: deliveryPagination.value.limit, offset } },
    )
    deliveries.value = data.data || []
    deliveryPagination.value = data.pagination || deliveryPagination.value
  } catch {
    deliveries.value = []
  }
}

function onDeliveryPageChange(page: number) {
  deliveryPage.value = page
  fetchDeliveries()
}

onMounted(fetchIntegrations)
</script>

<style scoped lang="scss">
.chat-integrations-container {
  padding: var(--cat-spacing-4);
  max-width: 1100px;
}

.chat-integrations-content {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
}

.platform-tabs {
  margin-bottom: var(--cat-spacing-2);
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

.actions-bar {
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  padding: var(--cat-spacing-6);
  text-align: center;
  color: var(--cat-text-secondary);
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
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

.delivery-log-section {
  margin-top: var(--cat-spacing-4);
  padding: var(--cat-spacing-4);
  background: var(--cat-bg-primary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);

  h4 {
    margin: 0 0 var(--cat-spacing-2);
    font-size: var(--cat-font-size-md);
  }
}

.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: var(--cat-spacing-3);
}

.form-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: 4px;
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
  margin: var(--cat-spacing-2) 0;
}
</style>
