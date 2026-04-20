<template>
  <div class="entity-audit-tab">
    <div v-if="!canView" class="empty-state">
      <p>{{ t('audit.permissionRequired') }}</p>
    </div>

    <template v-else>
      <div v-if="loading" class="loading-container" role="status" aria-live="polite">
        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchPage" class="retry-button" size="small">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <div v-if="entries.length === 0" class="empty-state">
          <p>{{ t('audit.empty') }}</p>
        </div>

        <el-table v-else :data="entries" stripe border>
          <el-table-column prop="createdAt" :label="t('audit.timestamp')" min-width="180">
            <template #default="{ row }">
              {{ formatTimestamp(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="action" :label="t('audit.action')" min-width="140">
            <template #default="{ row }">
              <span class="action-badge">{{ row.action }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="userId" :label="t('audit.userId')" min-width="240">
            <template #default="{ row }">
              <code class="id-cell">{{ row.userId ?? '-' }}</code>
            </template>
          </el-table-column>
          <el-table-column :label="t('audit.changes')" min-width="120">
            <template #default="{ row }">
              <el-button
                v-if="row.changes"
                link
                type="primary"
                size="small"
                @click="openChanges(row)"
              >
                {{ t('audit.viewChanges') }}
              </el-button>
              <span v-else class="empty-cell">-</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="total > pageSize"
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          small
          @current-change="handlePageChange"
        />
      </template>
    </template>

    <el-dialog
      v-model="showChangesDialog"
      :title="t('audit.changes')"
      width="640px"
    >
      <pre class="changes-view">{{ formattedChanges }}</pre>
      <template #footer>
        <el-button @click="showChangesDialog = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { formatTimestamp } from '@/utils/dateFormat'
import { listEntityAuditLogs, type AuditLogEntry } from '@/api/audit'

const props = withDefaults(
  defineProps<{
    entityType: string
    entityId: string
    pageSize?: number
  }>(),
  { pageSize: 20 },
)

const { t } = useI18n()
const authStore = useAuthStore()

const entries = ref<AuditLogEntry[]>([])
const total = ref(0)
const currentPage = ref(1)
const loading = ref(false)
const error = ref('')

const showChangesDialog = ref(false)
const selectedChanges = ref<unknown>(null)

// Hide the entire panel when the user lacks the permission, rather
// than rendering an empty table that looks like "no history" when the
// truth is "you cannot see the history." Route guard would also catch
// this on direct nav, but this tab lives inside a detail view any
// authenticated user can reach.
const canView = computed(() => authStore.hasPermission('admin.audit'))

const formattedChanges = computed(() => {
  if (selectedChanges.value == null) return ''
  try {
    return JSON.stringify(selectedChanges.value, null, 2)
  } catch {
    return String(selectedChanges.value)
  }
})

async function fetchPage() {
  if (!canView.value) return
  if (!props.entityType || !props.entityId) return
  loading.value = true
  error.value = ''
  try {
    const response = await listEntityAuditLogs(props.entityType, props.entityId, {
      limit: props.pageSize,
      offset: (currentPage.value - 1) * props.pageSize,
    })
    entries.value = response.data
    total.value = response.pagination.total
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || e.message || t('audit.loadError')
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchPage()
}

function openChanges(row: AuditLogEntry) {
  selectedChanges.value = row.changes
  showChangesDialog.value = true
}

watch(
  () => [props.entityType, props.entityId],
  () => {
    currentPage.value = 1
    fetchPage()
  },
)

onMounted(fetchPage)
</script>

<style scoped lang="scss">
.entity-audit-tab {
  padding: 0;
}

.loading-container {
  display: flex;
  align-items: center;
  gap: 8px;
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
  padding: var(--cat-spacing-6);
  color: var(--cat-text-tertiary);
}

.id-cell {
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
}

.action-badge {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  background-color: rgba(47, 129, 247, 0.15);
  color: #2f81f7;
}

.empty-cell {
  color: var(--cat-text-tertiary);
}

.changes-view {
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  padding: var(--cat-spacing-3);
  font-family: var(--cat-font-mono);
  font-size: var(--cat-font-size-sm);
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
