<template>
  <div class="row-actions">
    <button
      v-if="showEdit"
      class="row-actions__btn row-actions__btn--edit"
      :title="$t('common.edit')"
      :aria-label="$t('common.edit')"
      @click.stop="emit('edit')"
    >
      <EditIcon class="row-actions__icon" />
    </button>

    <button
      v-if="showView"
      class="row-actions__btn row-actions__btn--view"
      :title="$t('common.view')"
      :aria-label="$t('common.view')"
      @click.stop="emit('view')"
    >
      <View class="row-actions__icon" />
    </button>

    <el-popconfirm
      v-if="showDelete"
      :title="confirmDeleteTitle || $t('common.confirmDelete')"
      @confirm="emit('delete')"
    >
      <template #reference>
        <button
          class="row-actions__btn row-actions__btn--delete"
          :title="$t('common.delete')"
          :aria-label="$t('common.delete')"
          @click.stop
        >
          <Delete class="row-actions__icon" />
        </button>
      </template>
    </el-popconfirm>
  </div>
</template>

<script setup lang="ts">
import { Edit as EditIcon, Delete, View } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  showEdit?: boolean
  showDelete?: boolean
  showView?: boolean
  confirmDeleteTitle?: string
}>(), {
  showEdit: true,
  showDelete: true,
  showView: false,
})

const emit = defineEmits<{
  edit: []
  delete: []
  view: []
}>()
</script>

<style scoped lang="scss">
.row-actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.row-actions__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  box-sizing: border-box;

  &--edit {
    border: 1px solid #2f81f7;
    color: #2f81f7;

    &:hover {
      background: rgba(47, 129, 247, 0.1);
    }
  }

  &--view {
    border: 1px solid #2f81f7;
    color: #2f81f7;

    &:hover {
      background: rgba(47, 129, 247, 0.1);
    }
  }

  &--delete {
    border: 1px solid #f85149;
    color: #f85149;

    &:hover {
      background: rgba(248, 81, 73, 0.1);
    }
  }
}

.row-actions__icon {
  width: 14px;
  height: 14px;
}
</style>
