<template>
  <div class="admin-users-container">
    <PageHeader :title="t('admin.userManagement')">
      <template #actions>
        <el-button type="primary" @click="openNewUserDialog">{{ t('admin.createUser') }}</el-button>
      </template>
    </PageHeader>

    <div class="admin-users-content">
      <div v-if="selectedUsers.length > 0" class="bulk-actions-bar">
        <span class="selection-info">{{ selectedUsers.length }} {{ selectedUsers.length === 1 ? t('common.user') : t('common.users') }} {{ t('common.selected') }}</span>
        <div class="bulk-actions-buttons">
          <el-button @click="handleBulkDeactivate" :loading="saving">{{ t('admin.deactivateSelected') }}</el-button>
          <el-button @click="showRoleChangeDialog = true">{{ t('admin.changeRole') }}</el-button>
        </div>
      </div>

      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchUsers" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <el-table v-else :data="paginatedUsers" stripe border role="grid" aria-label="Users table" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="50"></el-table-column>
        <el-table-column prop="username" :label="t('admin.username')" min-width="150" sortable></el-table-column>
        <el-table-column prop="email" :label="t('admin.email')" min-width="200" sortable></el-table-column>
        <el-table-column prop="displayName" :label="t('admin.displayName')" min-width="150" sortable></el-table-column>
        <el-table-column :label="t('admin.role')" min-width="160" sortable prop="role">
          <template #default="{ row }">
            <span class="role-badge" :class="`role-badge--${row.role}`">{{ formatRole(row.role) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.status')" min-width="100" sortable prop="isActive">
          <template #default="{ row }">
            <span class="status-badge" :class="row.isActive ? 'status-badge--active' : 'status-badge--inactive'">{{ row.isActive ? t('common.active') : t('common.inactive') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" :label="t('admin.lastLogin')" min-width="150" sortable></el-table-column>
        <el-table-column :label="t('common.actions')" min-width="150">
          <template #default="{ row }">
            <IconButton :icon="EditIcon" variant="primary" :tooltip="t('common.edit')" @click="handleEdit(row)" />
            <IconButton :icon="Delete" variant="danger" :tooltip="t('common.delete')" @click="handleDelete(row)" />
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalCount"
        layout="total, prev, pager, next"
      />
    </div>

    <el-dialog v-model="showDialog" :title="dialogTitle" width="500px">
      <el-form :model="form" label-width="120px" @submit.prevent="handleSave">
        <el-form-item :label="t('admin.username')" required>
          <el-input v-model="form.username" :placeholder="t('admin.username')" :disabled="isEditing" />
        </el-form-item>

        <el-form-item :label="t('admin.email')" required>
          <el-input v-model="form.email" :placeholder="t('admin.email')" type="email" />
        </el-form-item>

        <el-form-item :label="t('admin.displayName')" required>
          <el-input v-model="form.displayName" :placeholder="t('admin.displayName')" />
        </el-form-item>

        <el-form-item v-if="!isEditing" :label="t('setup.password')" required>
          <el-input v-model="form.password" :placeholder="t('setup.password')" type="password" />
        </el-form-item>

        <el-form-item v-if="!isEditing" :label="t('setup.confirmPassword')" required>
          <el-input v-model="form.confirmPassword" :placeholder="t('setup.confirmPassword')" type="password" />
        </el-form-item>

        <el-form-item :label="t('admin.role')" required>
          <el-select v-model="form.role" :placeholder="t('admin.role')" clearable>
            <el-option label="Admin" value="admin" />
            <el-option label="Assessor" value="assessor" />
            <el-option label="Assessee" value="assessee" />
            <el-option label="Standards Manager" value="standards_manager" />
            <el-option label="Standards Approver" value="standards_approver" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="isEditing" :label="t('admin.status')">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRoleChangeDialog" :title="t('admin.changeRole')" width="400px">
      <el-form label-width="100px">
        <el-form-item :label="t('admin.role')">
          <el-select v-model="bulkRoleChange" :placeholder="t('admin.role')" clearable>
            <el-option label="Admin" value="admin" />
            <el-option label="Assessor" value="assessor" />
            <el-option label="Assessee" value="assessee" />
            <el-option label="Standards Manager" value="standards_manager" />
            <el-option label="Standards Approver" value="standards_approver" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showRoleChangeDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleBulkRoleChange">{{ t('common.apply') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Edit as EditIcon, Delete } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import IconButton from '@/components/shared/IconButton.vue'

const { t } = useI18n()

const users = ref([])
const loading = ref(false)
const error = ref('')
const showDialog = ref(false)
const saving = ref(false)
const isEditing = ref(false)
const dialogTitle = ref(t('admin.createUser'))
const editingUserId = ref('')
const selectedUsers = ref<any[]>([])
const showRoleChangeDialog = ref(false)
const bulkRoleChange = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const form = ref({
  username: '',
  email: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  role: '',
  isActive: true
})

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return users.value.slice(start, end)
})

const totalCount = computed(() => {
  return users.value.length
})

const fetchUsers = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get('/api/v1/users')
    users.value = response.data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch users'
  } finally {
    loading.value = false
  }
}

const openNewUserDialog = () => {
  form.value = {
    username: '',
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    role: '',
    isActive: true
  }
  isEditing.value = false
  showDialog.value = true
  dialogTitle.value = t('admin.createUser')
}

const handleEdit = (row: any) => {
  form.value = {
    username: row.username,
    email: row.email,
    displayName: row.displayName,
    password: '',
    confirmPassword: '',
    role: row.role,
    isActive: row.isActive
  }
  isEditing.value = true
  editingUserId.value = row.id
  showDialog.value = true
  dialogTitle.value = t('common.edit')
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to deactivate "${row.displayName || row.username}"?`,
      'Deactivate User',
      {
        confirmButtonText: 'Deactivate',
        cancelButtonText: 'Cancel',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }

  saving.value = true
  try {
    await axios.put(`/api/v1/users/${row.id}/deactivate`)
    ElMessage.success(t('common.success'))
    fetchUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to deactivate user')
  } finally {
    saving.value = false
  }
}

const handleSave = async () => {
  if (!form.value.username || !form.value.email || !form.value.displayName || !form.value.role) {
    ElMessage.error('Please fill in all required fields')
    return
  }

  if (!isEditing.value) {
    if (!form.value.password || !form.value.confirmPassword) {
      ElMessage.error('Please enter password')
      return
    }

    if (form.value.password !== form.value.confirmPassword) {
      ElMessage.error('Passwords do not match')
      return
    }
  }

  saving.value = true
  try {
    if (isEditing.value) {
      await axios.put(`/api/v1/users/${editingUserId.value}`, {
        email: form.value.email,
        displayName: form.value.displayName,
        role: form.value.role,
        isActive: form.value.isActive
      })
    } else {
      await axios.post('/api/v1/users', {
        username: form.value.username,
        email: form.value.email,
        displayName: form.value.displayName,
        password: form.value.password,
        role: form.value.role
      })
    }

    ElMessage.success(t('common.success'))
    showDialog.value = false
    fetchUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to save user')
  } finally {
    saving.value = false
  }
}

const formatRole = (role: string): string => {
  const map: Record<string, string> = {
    admin: 'Admin',
    assessor: 'Assessor',
    assessee: 'Assessee',
    standards_manager: 'Standards Manager',
    standards_approver: 'Standards Approver',
  }
  return map[role] || role
}

const handleSelectionChange = (selection: any[]) => {
  selectedUsers.value = selection
}

const handleBulkDeactivate = async () => {
  if (selectedUsers.value.length === 0) return

  saving.value = true
  try {
    const deactivatePromises = selectedUsers.value.map(user =>
      axios.put(`/api/v1/users/${user.id}/deactivate`)
    )
    await Promise.all(deactivatePromises)
    ElMessage.success(t('common.success'))
    selectedUsers.value = []
    fetchUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to deactivate users')
  } finally {
    saving.value = false
  }
}

const handleBulkRoleChange = async () => {
  if (!bulkRoleChange.value || selectedUsers.value.length === 0) {
    ElMessage.error('Please select a role')
    return
  }

  saving.value = true
  try {
    const updatePromises = selectedUsers.value.map(user =>
      axios.put(`/api/v1/users/${user.id}`, {
        role: bulkRoleChange.value
      })
    )
    await Promise.all(updatePromises)
    ElMessage.success(t('common.success'))
    showRoleChangeDialog.value = false
    bulkRoleChange.value = ''
    selectedUsers.value = []
    fetchUsers()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to change roles')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<style scoped lang="scss">
.admin-users-container {
  padding: 0;
}

.admin-users-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
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

.bulk-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--cat-spacing-4) var(--cat-spacing-6);
  background-color: var(--cat-bg-secondary);
  border-bottom: 1px solid var(--cat-border-primary);
  margin-bottom: var(--cat-spacing-4);

  .selection-info {
    color: var(--cat-text-primary);
    font-weight: 500;
  }

  .bulk-actions-buttons {
    display: flex;
    gap: var(--cat-spacing-3);
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
  &--active {
    background-color: rgba(57, 211, 83, 0.15);
    color: #39d353;
  }

  &--inactive {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}
</style>
