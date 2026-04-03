<template>
  <div class="row-actions">
    <IconButton
      v-if="showEdit"
      :icon="EditIcon"
      variant="primary"
      :tooltip="$t('common.edit')"
      @click="emit('edit')"
    />
    <IconButton
      v-if="showView"
      :icon="View"
      variant="primary"
      :tooltip="$t('common.view')"
      @click="emit('view')"
    />
    <IconButton
      v-if="showDelete"
      :icon="Delete"
      variant="danger"
      :tooltip="$t('common.delete')"
      @click="emit('delete')"
    />
  </div>
</template>

<script setup lang="ts">
import { Edit as EditIcon, Delete, View } from '@element-plus/icons-vue'
import IconButton from '@/components/shared/IconButton.vue'

withDefaults(defineProps<{
  showEdit?: boolean
  showDelete?: boolean
  showView?: boolean
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
</style>
