<template>
  <div class="admin-audit-container">
    <PageHeader :title="t('audit.title')" :subtitle="t('audit.subtitle')">
      <template #actions>
        <el-button
          v-if="canExport"
          :disabled="loading || entries.length === 0"
          @click="handleExport"
        >
          {{ t('audit.exportCsv') }}
        </el-button>
      </template>
    </PageHeader>

    <div class="admin-audit-content">
      <div class="filter-bar" role="search" :aria-label="t('audit.filters')">
        <div class="filter-grid">
        <div class="filter-field">
          <label class="filter-label" :for="entityTypeId">{{ t('audit.entityType') }}</label>
          <el-autocomplete
            :id="entityTypeId"
            v-model="filters.entityType"
            :fetch-suggestions="fetchEntityTypeSuggestions"
            :placeholder="t('audit.entityTypePlaceholder')"
            :trigger-on-focus="true"
            clearable
            @select="onEntityTypeSelect"
            @change="applyFilters"
            @clear="applyFilters"
          />
        </div>

        <div class="filter-field">
          <label class="filter-label" :for="entityIdId">{{ t('audit.entityId') }}</label>
          <el-input
            :id="entityIdId"
            v-model="filters.entityId"
            :placeholder="t('audit.entityIdPlaceholder')"
            clearable
            @change="applyFilters"
          />
        </div>

        <div class="filter-field">
          <label class="filter-label" :for="userIdId">{{ t('audit.userId') }}</label>
          <el-input
            :id="userIdId"
            v-model="filters.userId"
            :placeholder="t('audit.userIdPlaceholder')"
            clearable
            @change="applyFilters"
          />
        </div>

        <div class="filter-field">
          <label class="filter-label" :for="actionId">{{ t('audit.action') }}</label>
          <el-autocomplete
            :id="actionId"
            v-model="filters.action"
            :fetch-suggestions="fetchActionSuggestions"
            :placeholder="t('audit.actionPlaceholder')"
            :trigger-on-focus="true"
            clearable
            @select="onActionSelect"
            @change="applyFilters"
            @clear="applyFilters"
          />
        </div>

        <div class="filter-field filter-field--wide">
          <label class="filter-label">{{ t('audit.dateRange') }}</label>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            :start-placeholder="t('audit.startDate')"
            :end-placeholder="t('audit.endDate')"
            value-format="YYYY-MM-DD"
            unlink-panels
            @change="applyFilters"
          />
        </div>

        <!--
          Action cell sits in the grid on the same row as the date
          range, taking the remaining columns. Baseline aligned with
          the other fields (align-items: end on the grid) and right
          justified so the buttons hug the edge of the card. The
          name/ID switch lives here rather than per column so toggling
          never costs a refetch; the server always returns both and we
          flip what the table renders locally.
        -->
        <div class="filter-actions">
          <el-tooltip
            :content="showIds ? t('audit.toggleNamesTooltip') : t('audit.toggleIdsTooltip')"
            placement="top"
          >
            <el-button class="name-toggle" @click="showIds = !showIds">
              <el-icon><component :is="showIds ? User : Key" /></el-icon>
              <span class="name-toggle__label">{{
                showIds ? t('audit.showingIds') : t('audit.showingNames')
              }}</span>
            </el-button>
          </el-tooltip>
          <el-button @click="clearFilters">{{ t('common.clear') }}</el-button>
        </div>
        </div>
      </div>

      <div v-if="loading" class="loading-container" role="status" aria-live="polite">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchPage" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <div v-if="entries.length === 0" class="empty-state">
          <p>{{ t('audit.empty') }}</p>
        </div>

        <el-table v-else :data="entries" stripe border role="grid" aria-label="Audit log">
          <el-table-column prop="createdAt" :label="t('audit.timestamp')" min-width="180">
            <template #default="{ row }">
              {{ formatTimestamp(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="entityType" :label="t('audit.entityType')" min-width="140" />
          <el-table-column :label="t('audit.entity')" min-width="240">
            <template #default="{ row }">
              <span v-if="showIds || !row.entityName" class="id-cell">{{ row.entityId ?? '-' }}</span>
              <el-tooltip
                v-else
                :content="row.entityId ?? ''"
                placement="top"
                :show-after="400"
              >
                <span class="name-cell">{{ row.entityName }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column prop="action" :label="t('audit.action')" min-width="140">
            <template #default="{ row }">
              <span class="action-badge" :class="`action-badge--${row.action}`">{{ row.action }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('audit.user')" min-width="240">
            <template #default="{ row }">
              <span v-if="showIds || !row.userDisplayName" class="id-cell">{{ row.userId ?? '-' }}</span>
              <el-tooltip
                v-else
                :content="row.userId ?? ''"
                placement="top"
                :show-after="400"
              >
                <span class="name-cell">{{ row.userDisplayName }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column :label="t('audit.changes')" width="100" align="center">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.changes"
                :content="t('audit.viewChanges')"
                placement="top"
              >
                <el-button
                  link
                  type="primary"
                  size="small"
                  class="view-changes-btn"
                  :aria-label="t('audit.viewChanges')"
                  @click="openChanges(row)"
                >
                  <el-icon :size="18"><View /></el-icon>
                </el-button>
              </el-tooltip>
              <span v-else class="empty-cell">-</span>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @size-change="handlePageSizeChange"
          @current-change="handlePageChange"
        />
      </template>
    </div>

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
import { ref, computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, View, User, Key } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { formatTimestamp } from '@/utils/dateFormat'
import { listAuditLogs, getAuditOptions, type AuditLogEntry } from '@/api/audit'
import { rowsToCsv, downloadCsv } from '@/utils/csvExport'

const { t } = useI18n()
const authStore = useAuthStore()

// Element Plus v-ids are not reliably unique across multiple mounted
// audit views, so bind each label to a Vue-generated id manually.
const entityTypeId = useId()
const entityIdId = useId()
const userIdId = useId()
const actionId = useId()

interface Filters {
  entityType: string
  entityId: string
  userId: string
  action: string
}

interface AutocompleteSuggestion {
  value: string
}

const filters = ref<Filters>({
  entityType: '',
  entityId: '',
  userId: '',
  action: '',
})

const dateRange = ref<[string, string] | null>(null)
const entries = ref<AuditLogEntry[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const currentPage = ref(1)
const pageSize = ref(50)

const showChangesDialog = ref(false)
const selectedChanges = ref<unknown>(null)

// The user/ID toggle state lives in the component rather than a user
// preference because today's audit session tends to start with a
// "what happened" scan (names) and end with a "prove it" drill-down
// (IDs). If we later want to persist this, lift it to auth/user prefs.
const showIds = ref(false)

// Cached option lists powering the typeahead filters. Fetched once on
// mount; audit log contents change slowly and new entity types only
// appear when code ships a new logAudit call, so stale-reads are fine.
const entityTypeOptions = ref<string[]>([])
const actionOptions = ref<string[]>([])

// Audit log is an admin-only view; the route guard already enforces
// admin.audit, but we also gate the export action so a user whose
// permission is revoked mid session loses the dangerous action right
// away on the next navigation refresh.
const canExport = computed(() => authStore.hasPermission('admin.audit'))

const formattedChanges = computed(() => {
  if (selectedChanges.value == null) return ''
  try {
    return JSON.stringify(selectedChanges.value, null, 2)
  } catch {
    return String(selectedChanges.value)
  }
})

/**
 * Case-insensitive prefix/substring match used by both the entity
 * type and action typeaheads. Kept local because the set is small
 * (<20 items) and a full fuzzy lib would be overkill.
 */
function suggestFrom(options: string[], queryString: string): AutocompleteSuggestion[] {
  const q = queryString.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => o.toLowerCase().includes(q))
    : options
  return filtered.map(value => ({ value }))
}

function fetchEntityTypeSuggestions(
  queryString: string,
  cb: (suggestions: AutocompleteSuggestion[]) => void,
) {
  cb(suggestFrom(entityTypeOptions.value, queryString))
}

function fetchActionSuggestions(
  queryString: string,
  cb: (suggestions: AutocompleteSuggestion[]) => void,
) {
  cb(suggestFrom(actionOptions.value, queryString))
}

function onEntityTypeSelect(item: AutocompleteSuggestion) {
  filters.value.entityType = item.value
  applyFilters()
}

function onActionSelect(item: AutocompleteSuggestion) {
  filters.value.action = item.value
  applyFilters()
}

async function fetchPage() {
  loading.value = true
  error.value = ''
  try {
    const response = await listAuditLogs({
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value,
      entityType: filters.value.entityType.trim() || undefined,
      entityId: filters.value.entityId.trim() || undefined,
      userId: filters.value.userId.trim() || undefined,
      action: filters.value.action.trim() || undefined,
      from: dateRange.value?.[0] || undefined,
      to: dateRange.value?.[1] ? `${dateRange.value[1]}T23:59:59Z` : undefined,
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

async function fetchOptions() {
  // A failure here shouldn't kill the audit view; an empty typeahead
  // still falls back to free-text entry, which is how the screen used
  // to behave before this endpoint existed.
  try {
    const options = await getAuditOptions()
    entityTypeOptions.value = options.entityTypes
    actionOptions.value = options.actions
  } catch {
    entityTypeOptions.value = []
    actionOptions.value = []
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchPage()
}

function clearFilters() {
  filters.value = { entityType: '', entityId: '', userId: '', action: '' }
  dateRange.value = null
  currentPage.value = 1
  fetchPage()
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchPage()
}

function handlePageSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  fetchPage()
}

function openChanges(row: AuditLogEntry) {
  selectedChanges.value = row.changes
  showChangesDialog.value = true
}

async function handleExport() {
  if (!canExport.value) {
    ElMessage.error(t('common.forbidden'))
    return
  }

  // Fetch the currently-filtered result set for the export rather than
  // just the visible page. Cap to 10k rows defensively; larger audits
  // must be pulled via the API with a script. This prevents the
  // browser tab from running out of memory on a multi-year export.
  const MAX_EXPORT_ROWS = 10_000
  try {
    const response = await listAuditLogs({
      limit: MAX_EXPORT_ROWS,
      offset: 0,
      entityType: filters.value.entityType.trim() || undefined,
      entityId: filters.value.entityId.trim() || undefined,
      userId: filters.value.userId.trim() || undefined,
      action: filters.value.action.trim() || undefined,
      from: dateRange.value?.[0] || undefined,
      to: dateRange.value?.[1] ? `${dateRange.value[1]}T23:59:59Z` : undefined,
    })

    if (response.pagination.total > MAX_EXPORT_ROWS) {
      ElMessage.warning(
        t('audit.exportTruncated', {
          limit: MAX_EXPORT_ROWS,
          total: response.pagination.total,
        }),
      )
    }

    // Every cell passes through CSV injection sanitization inside
    // rowsToCsv, so attacker-controlled fields like entityId cannot
    // turn into live formulas when the file opens. The DB schema does
    // not record IP, user agent, or request ID on audit rows today, so
    // the CSV does not include those columns. We do include the
    // resolved names next to the IDs so a downstream analyst does not
    // have to join in another tool to read the output.
    //
    // `rowsToCsv` is generic over `Record<string, unknown>` so it can
    // handle arbitrary column maps. `AuditLogEntry` is a closed
    // interface and therefore lacks an index signature; cast through
    // the unknown-indexed shape so TS is satisfied without loosening
    // the domain type elsewhere.
    const csv = rowsToCsv(response.data as unknown as ReadonlyArray<Record<string, unknown>>, [
      { key: 'createdAt', label: 'Timestamp' },
      { key: 'entityType', label: 'Entity Type' },
      { key: 'entityId', label: 'Entity ID' },
      { key: 'entityName', label: 'Entity Name' },
      { key: 'action', label: 'Action' },
      { key: 'userId', label: 'User ID' },
      { key: 'userDisplayName', label: 'User Name' },
      { key: 'changes', label: 'Changes' },
    ])
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`audit-log-${timestamp}.csv`, csv)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('audit.exportError'))
  }
}

onMounted(() => {
  fetchPage()
  fetchOptions()
})
</script>

<style scoped lang="scss">
.admin-audit-container {
  padding: 0;
}

.admin-audit-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.filter-bar {
  padding: var(--cat-spacing-3);
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  margin-bottom: var(--cat-spacing-4);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--cat-spacing-3);
  align-items: end;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &--wide {
    grid-column: span 2;
  }

  :deep(.el-autocomplete) {
    width: 100%;
  }
}

.filter-label {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-actions {
  // Shares the date-range row. `span 2` mirrors the date picker's
  // footprint so the two cells sit side by side when the auto-fill
  // grid resolves to four columns, which is the common case. On
  // narrow viewports the actions wrap to a fresh row on their own,
  // which is the least-bad alternative to cramping every field.
  grid-column: span 2;
  display: flex;
  align-items: end;
  justify-content: flex-end;
  gap: var(--cat-spacing-2);
  flex-wrap: wrap;
}

.name-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &__label {
    font-size: var(--cat-font-size-sm);
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
  padding: var(--cat-spacing-4) 0;

  .retry-button {
    margin-top: 16px;
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

.name-cell {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-primary);
}

// Action badges. Each action gets its own hue so a visual scan of the
// log surfaces outliers (deletes, authz denials, config changes)
// without reading every row. Colors pick from the Element Plus status
// palette so they honor light/dark mode and WCAG AA contrast. Any new
// action value should get a matching rule here, otherwise it falls
// through to the generic neutral styling.
.action-badge {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  background-color: rgba(144, 147, 153, 0.18);
  color: var(--el-color-info, #909399);

  &--create,
  &--create_for_other {
    background-color: rgba(103, 194, 58, 0.18);
    color: var(--el-color-success, #67c23a);
  }

  &--update {
    background-color: rgba(47, 129, 247, 0.15);
    color: var(--el-color-primary, #2f81f7);
  }

  &--state_change {
    background-color: rgba(144, 87, 255, 0.18);
    color: #9057ff;
  }

  &--link {
    background-color: rgba(32, 201, 151, 0.18);
    color: #20c997;
  }

  &--unlink {
    background-color: rgba(230, 162, 60, 0.18);
    color: var(--el-color-warning, #e6a23c);
  }

  &--delete {
    background-color: rgba(245, 108, 108, 0.18);
    color: var(--el-color-danger, #f56c6c);
  }

  &--authz_denied {
    background-color: rgba(245, 108, 108, 0.22);
    color: var(--el-color-danger, #f56c6c);
    font-weight: var(--cat-font-weight-semibold, 600);
  }

  &--config_change {
    background-color: rgba(255, 193, 7, 0.18);
    color: #ffc107;
  }
}

.view-changes-btn {
  padding: 4px;
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
