<template>
  <div class="requirement-tree">
    <!-- Table header -->
    <div class="req-tree-header">
      <div class="req-cell req-cell-drag" v-if="editable">&nbsp;</div>
      <div class="req-cell req-cell-id">{{ t('common.id') }}</div>
      <div class="req-cell req-cell-name">{{ t('standards.name') }}</div>
      <div class="req-cell req-cell-desc">{{ t('standards.description') }}</div>
      <div class="req-cell req-cell-actions" v-if="editable">{{ t('common.actions') }}</div>
    </div>

    <!-- Recursive draggable tree -->
    <RequirementGroup
      :items="modelValue"
      :parent-id="null"
      :depth="0"
      :editable="editable"
      :editing-field="editingField"
      :editing-value="editingValue"
      :drag-node-id="dragNodeId"
      @start-edit="startEdit"
      @save-edit="saveEdit"
      @cancel-edit="cancelEdit"
      @update-edit-value="editingValue = $event"
      @delete="$emit('delete', $event)"
      @edit="$emit('edit', $event)"
      @reparent="handleReparent"
      @drag-start="dragNodeId = $event"
      @drag-end="dragNodeId = null"
    />

    <div v-if="modelValue.length === 0" class="req-tree-empty">
      No requirements defined
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RequirementGroup from './RequirementGroup.vue'

const { t } = useI18n()

export interface RequirementNode {
  id: string
  identifier: string
  name: string
  parent_id?: string | null
  description: string | null
  open_cre?: string | null
  children: RequirementNode[]
}

const props = defineProps<{
  modelValue: RequirementNode[]
  editable: boolean
}>()

const emit = defineEmits<{
  (e: 'delete', row: RequirementNode): void
  (e: 'edit', row: RequirementNode): void
  (e: 'save-inline', row: RequirementNode, field: string, value: string): void
  (e: 'reparent', requirementId: string, newParentId: string | null): void
}>()

// Inline editing state
const editingField = ref<{ id: string; field: string } | null>(null)
const editingValue = ref('')
const dragNodeId = ref<string | null>(null)

const startEdit = (row: RequirementNode, field: string) => {
  if (!props.editable) return
  editingField.value = { id: row.id, field }
  editingValue.value = (row as Record<string, unknown>)[field] as string || ''
}

const saveEdit = (row: RequirementNode) => {
  if (!editingField.value) return
  emit('save-inline', row, editingField.value.field, editingValue.value)
  editingField.value = null
  editingValue.value = ''
}

const cancelEdit = () => {
  editingField.value = null
  editingValue.value = ''
}

const handleReparent = (requirementId: string, newParentId: string | null) => {
  emit('reparent', requirementId, newParentId)
}
</script>

<style scoped lang="scss">
.requirement-tree {
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  overflow: hidden;
}

.req-tree-header {
  display: flex;
  background-color: var(--cat-bg-secondary);
  border-bottom: 1px solid var(--cat-border-default);
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-secondary);
}

.req-cell {
  padding: 10px 12px;
  display: flex;
  align-items: center;
}

.req-cell-drag {
  width: 36px;
  flex-shrink: 0;
}

.req-cell-id {
  width: 160px;
  flex-shrink: 0;
}

.req-cell-name {
  flex: 1;
  min-width: 200px;
}

.req-cell-desc {
  flex: 1;
  min-width: 200px;
}

.req-cell-actions {
  width: 100px;
  flex-shrink: 0;
  justify-content: center;
}

.req-tree-empty {
  padding: 24px;
  text-align: center;
  color: var(--cat-text-tertiary);
}
</style>
