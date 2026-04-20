<template>
  <div class="admin-invitations" :class="{ 'admin-invitations--embedded': embedded }">
    <PageHeader
      v-if="!embedded"
      :title="t('invites.title')"
      :subtitle="t('invites.subtitle')"
    >
      <template #actions>
        <el-button type="primary" @click="openCreateDialog">
          {{ t('invites.create') }}
        </el-button>
      </template>
    </PageHeader>

    <div class="admin-invitations__toolbar" v-if="embedded">
      <el-button type="primary" @click="openCreateDialog">
        {{ t('invites.create') }}
      </el-button>
    </div>

    <div class="admin-invitations__content">
      <div v-if="loading" class="loading-container" role="status" aria-live="polite">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchAll" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <div v-if="invites.length === 0" class="empty-state">
          <p>{{ t('invites.empty') }}</p>
        </div>

        <el-table v-else :data="invites" stripe border aria-label="Invitations">
          <el-table-column prop="email" :label="t('invites.email')" min-width="220">
            <template #default="{ row }">
              <span v-if="row.email">{{ row.email }}</span>
              <span v-else class="empty-cell">{{ t('invites.anyRecipient') }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="intendedRole" :label="t('invites.role')" min-width="160">
            <template #default="{ row }">
              <span class="role-badge" :class="`role-badge--${row.intendedRole}`">
                {{ formatRole(row.intendedRole) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="status" :label="t('invites.status')" min-width="120">
            <template #default="{ row }">
              <span class="status-badge" :class="`status-badge--${row.status}`">
                {{ t(`invites.statuses.${row.status}`) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('invites.createdAt')" min-width="170">
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="expiresAt" :label="t('invites.expiresAt')" min-width="170">
            <template #default="{ row }">
              {{ formatDateTime(row.expiresAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="120">
            <template #default="{ row }">
              <IconButton
                v-if="row.status === 'pending'"
                :icon="CircleClose"
                variant="danger"
                :tooltip="t('invites.revoke')"
                @click="handleRevoke(row)"
              />
              <span v-else class="empty-cell">-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <el-dialog
      v-model="showCreateDialog"
      :title="t('invites.create')"
      width="520px"
      :close-on-click-modal="false"
      @close="handleCreateDialogClose"
    >
      <el-alert
        v-if="emailConfigured === false"
        :title="t('invites.emailNotConfiguredTitle')"
        :description="t('invites.emailNotConfiguredDesc')"
        type="warning"
        show-icon
        :closable="false"
        class="email-warning"
      />

      <el-form :model="form" label-width="150px" @submit.prevent="handleCreate">
        <el-form-item :label="t('invites.email')">
          <el-input
            v-model="form.email"
            type="email"
            autocomplete="off"
            :placeholder="t('invites.emailOptional')"
            :disabled="saving"
          />
          <div class="form-hint">{{ t('invites.emailHint') }}</div>
        </el-form-item>

        <el-form-item :label="t('invites.role')">
          <el-select v-model="form.intendedRole" :disabled="saving">
            <el-option label="Admin" value="admin" />
            <el-option label="Assessor" value="assessor" />
            <el-option label="Assessee" value="assessee" />
            <el-option label="Standards Manager" value="standards_manager" />
            <el-option label="Standards Approver" value="standards_approver" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('invites.expiresIn')">
          <el-select v-model="form.expiresInHours" :disabled="saving">
            <el-option :label="t('invites.hours1')" :value="1" />
            <el-option :label="t('invites.hours24')" :value="24" />
            <el-option :label="t('invites.days7')" :value="168" />
            <el-option :label="t('invites.days30')" :value="720" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false" :disabled="saving">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">{{ t('invites.create') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showTokenDialog"
      :title="t('invites.tokenDialogTitle')"
      width="640px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="true"
      @close="handleTokenDialogClose"
    >
      <el-alert
        :title="t('invites.tokenOnceWarning')"
        type="warning"
        show-icon
        :closable="false"
        class="token-warning"
      />

      <el-alert
        v-if="emailConfigured === false"
        :title="t('invites.emailNotConfiguredTitle')"
        :description="t('invites.emailNotConfiguredDesc')"
        type="warning"
        show-icon
        :closable="false"
        class="email-warning"
      />

      <div class="token-display" role="group" :aria-label="t('invites.tokenDialogTitle')">
        <label class="token-label" :for="tokenInputId">{{ t('invites.token') }}</label>
        <div class="token-copy-row">
          <el-input
            :id="tokenInputId"
            :model-value="revealedToken ?? ''"
            readonly
            type="text"
            class="token-input"
          />
          <el-button type="primary" @click="copyToken">{{ t('common.copy') }}</el-button>
        </div>
      </div>

      <div v-if="createdInvite" class="token-details">
        <div class="token-detail">
          <span class="token-detail__label">{{ t('invites.email') }}</span>
          <span class="token-detail__value">{{ createdInvite.email || t('invites.anyRecipient') }}</span>
        </div>
        <div class="token-detail">
          <span class="token-detail__label">{{ t('invites.role') }}</span>
          <span class="token-detail__value">{{ formatRole(createdInvite.intendedRole) }}</span>
        </div>
        <div class="token-detail">
          <span class="token-detail__label">{{ t('invites.expiresAt') }}</span>
          <span class="token-detail__value">{{ formatDateTime(createdInvite.expiresAt) }}</span>
        </div>
      </div>

      <template #footer>
        <el-button type="primary" @click="showTokenDialog = false">{{ t('common.done') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, CircleClose } from '@element-plus/icons-vue'
import IconButton from '@/components/shared/IconButton.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import { formatDateTime } from '@/utils/dateFormat'
import {
  listInvites,
  createInvite,
  revokeInvite,
  getInviteEmailConfigured,
  type Invite,
  type CreatedInvite,
  type InviteRole,
} from '@/api/invites'

defineProps<{
  embedded?: boolean
}>()

const { t } = useI18n()
const tokenInputId = useId()

const invites = ref<Invite[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
// Tracks whether outbound SMTP is configured on the server. When
// false, the create-invite dialog and the post-create token dialog
// both surface a prominent warning so the admin knows the invite will
// not be emailed and the token must be shared out of band. Starts as
// null (unknown) so we do not flash a false warning before the check
// resolves; the banners only render when it has resolved to false.
const emailConfigured = ref<boolean | null>(null)

const showCreateDialog = ref(false)
const showTokenDialog = ref(false)
const createdInvite = ref<CreatedInvite | null>(null)
// We deliberately keep the plaintext token in a separate ref so we
// can null it out independently of the rest of the created-invite
// record. When the user closes the token dialog we immediately drop
// the token from memory; there is no "show it to me again" affordance.
const revealedToken = ref<string | null>(null)

const form = ref<{ email: string; intendedRole: InviteRole; expiresInHours: number }>({
  email: '',
  intendedRole: 'assessee',
  expiresInHours: 168,
})

async function fetchAll() {
  loading.value = true
  error.value = ''
  try {
    invites.value = await listInvites()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || e.message || t('invites.loadError')
  } finally {
    loading.value = false
  }
}

async function fetchEmailConfigured() {
  // Best-effort check: if this call fails we leave emailConfigured as
  // null rather than defaulting to either true or false. A network
  // error should not produce a misleading banner in either direction;
  // the server remains authoritative on whether the invite actually
  // gets emailed.
  try {
    emailConfigured.value = await getInviteEmailConfigured()
  } catch {
    emailConfigured.value = null
  }
}

function openCreateDialog() {
  form.value = { email: '', intendedRole: 'assessee', expiresInHours: 168 }
  showCreateDialog.value = true
}

function handleCreateDialogClose() {
  // Extra defense: clear any stale form state once the dialog goes
  // away so a re-open does not display a previous email.
  form.value = { email: '', intendedRole: 'assessee', expiresInHours: 168 }
}

async function handleCreate() {
  const email = form.value.email.trim()
  if (email.length > 0) {
    // Basic client side shape check. The server is authoritative via
    // zod; this keeps the form from round tripping the server just to
    // reject a visibly malformed address.
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(email)) {
      ElMessage.error(t('invites.invalidEmail'))
      return
    }
  }

  saving.value = true
  try {
    const result = await createInvite({
      email: email || undefined,
      intendedRole: form.value.intendedRole,
      expiresInHours: form.value.expiresInHours,
    })
    createdInvite.value = result
    revealedToken.value = result.token
    showCreateDialog.value = false
    showTokenDialog.value = true
    await fetchAll()
    ElMessage.success(t('invites.createSuccess'))
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || e.message || t('invites.createError'))
  } finally {
    saving.value = false
  }
}

async function handleRevoke(row: Invite) {
  try {
    await ElMessageBox.confirm(
      t('invites.confirmRevoke', { target: row.email || t('invites.anyRecipient') }),
      t('invites.revoke'),
      {
        confirmButtonText: t('invites.revoke'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  try {
    await revokeInvite(row.id)
    ElMessage.success(t('invites.revokeSuccess'))
    await fetchAll()
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
    if (e.response?.status === 409) {
      // 409 = invite has already been consumed. Refresh so the UI
      // reflects the authoritative state rather than insisting the
      // invite is still pending.
      ElMessage.warning(t('invites.alreadyConsumed'))
      await fetchAll()
      return
    }
    ElMessage.error(e.response?.data?.error || e.message || t('invites.revokeError'))
  }
}

async function copyToken() {
  const token = revealedToken.value
  if (!token) return
  try {
    // Prefer the modern async clipboard API (Promise based, requires
    // secure context). Fall back to a transient textarea copy for
    // environments without it so the feature is still usable.
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(token)
    } else {
      const ta = document.createElement('textarea')
      ta.value = token
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    ElMessage.success(t('invites.tokenCopied'))
  } catch {
    ElMessage.error(t('invites.tokenCopyError'))
  }
}

function handleTokenDialogClose() {
  // Drop the plaintext token from memory immediately. The server
  // never returns it again, and we do not want a browser devtools
  // inspection after the dialog closes to recover it from a reactive
  // ref snapshot.
  revealedToken.value = null
  createdInvite.value = null
}

function formatRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'Admin',
    assessor: 'Assessor',
    assessee: 'Assessee',
    standards_manager: 'Standards Manager',
    standards_approver: 'Standards Approver',
  }
  return map[role] || role
}

onMounted(() => {
  fetchAll()
  fetchEmailConfigured()
})
</script>

<style scoped lang="scss">
.admin-invitations {
  padding: 0;

  &--embedded {
    padding-top: var(--cat-spacing-3);
  }
}

.admin-invitations__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--cat-spacing-3);
}

.admin-invitations__content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);

  .admin-invitations--embedded & {
    padding: 0;
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

.empty-state {
  text-align: center;
  padding: var(--cat-spacing-6);
  color: var(--cat-text-tertiary);
}

.empty-cell {
  color: var(--cat-text-tertiary);
  font-style: italic;
}

.form-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: 4px;
}

.token-warning {
  margin-bottom: var(--cat-spacing-4);
}

.email-warning {
  margin-bottom: var(--cat-spacing-4);
}

.token-display {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-2);
  margin-bottom: var(--cat-spacing-4);
}

.token-label {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.token-copy-row {
  display: flex;
  gap: var(--cat-spacing-2);
  align-items: center;

  :deep(.token-input) {
    flex: 1;

    input {
      font-family: var(--cat-font-mono);
      font-size: var(--cat-font-size-sm);
    }
  }
}

.token-details {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-2);
  padding: var(--cat-spacing-3);
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
}

.token-detail {
  display: flex;
  justify-content: space-between;
  gap: var(--cat-spacing-3);
  font-size: var(--cat-font-size-sm);

  &__label {
    color: var(--cat-text-tertiary);
  }

  &__value {
    color: var(--cat-text-primary);
    font-weight: var(--cat-font-weight-medium);
  }
}

.role-badge,
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  line-height: 1.6;
  white-space: nowrap;
}

.role-badge {
  &--admin {
    background-color: rgba(248, 81, 73, 0.15);
    color: #f85149;
  }
  &--assessor {
    background-color: rgba(47, 129, 247, 0.15);
    color: #2f81f7;
  }
  &--assessee {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }
  &--standards_manager {
    background-color: rgba(163, 113, 247, 0.15);
    color: #a371f7;
  }
  &--standards_approver {
    background-color: rgba(219, 97, 162, 0.15);
    color: #db61a2;
  }
}

.status-badge {
  &--pending {
    background-color: rgba(47, 129, 247, 0.15);
    color: #2f81f7;
  }
  &--consumed {
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
  }
  &--revoked {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }
  &--expired {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }
}
</style>
