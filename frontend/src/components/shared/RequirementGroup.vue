<template>
  <div class="requirement-group">
    <div
      v-for="element in items"
      :key="element.id"
      class="req-tree-node"
    >
      <div
        class="req-tree-row"
        :class="{
          'req-tree-row-stripe': items.indexOf(element) % 2 === 1,
          'drop-target': dropTargetId === element.id,
          'is-dragging': dragNodeId === element.id,
        }"
        :draggable="editable"
        @dragstart.stop="onDragStart($event, element)"
        @dragend.stop="onDragEnd"
        @dragover.prevent="onDragOver($event, element)"
        @dragleave="onDragLeave(element)"
        @drop.prevent="onDrop($event, element)"
      >
        <!-- Drag handle -->
        <div class="req-cell req-cell-drag" v-if="editable">
          <span class="drag-handle" title="Drag to reparent">&#x2630;</span>
        </div>

        <!-- Identifier (inline editable) -->
        <div class="req-cell req-cell-id">
          <span
            class="tree-indent"
            :style="{ width: `${depth * 20}px` }"
          ></span>
          <span
            v-if="element.children?.length"
            class="tree-toggle"
            :class="{ 'tree-toggle-open': isExpanded(element.id) }"
            @click="toggleExpand(element.id)"
          >
            <el-icon :size="14"><ArrowRight /></el-icon>
          </span>
          <span v-else class="tree-toggle-placeholder">&nbsp;</span>

          <div
            v-if="isEditing(element.id, 'identifier')"
            class="inline-edit"
            @click.stop
          >
            <el-input
              :model-value="editingValue"
              size="small"
              @update:model-value="$emit('update-edit-value', $event)"
              @keydown.enter="$emit('save-edit', element)"
              @keydown.escape="$emit('cancel-edit')"
            />
            <div class="inline-edit-actions">
              <el-button size="small" type="primary" link @click="$emit('save-edit', element)">&#10003;</el-button>
              <el-button size="small" link @click="$emit('cancel-edit')">&#10005;</el-button>
            </div>
          </div>
          <span
            v-else
            class="editable-text"
            :class="{ 'clickable': editable }"
            @click="editable && $emit('start-edit', element, 'identifier')"
          >{{ element.identifier }}</span>
        </div>

        <!-- Name (inline editable) -->
        <div class="req-cell req-cell-name">
          <div
            v-if="isEditing(element.id, 'name')"
            class="inline-edit"
            @click.stop
          >
            <el-input
              :model-value="editingValue"
              size="small"
              @update:model-value="$emit('update-edit-value', $event)"
              @keydown.enter="$emit('save-edit', element)"
              @keydown.escape="$emit('cancel-edit')"
            />
            <div class="inline-edit-actions">
              <el-button size="small" type="primary" link @click="$emit('save-edit', element)">&#10003;</el-button>
              <el-button size="small" link @click="$emit('cancel-edit')">&#10005;</el-button>
            </div>
          </div>
          <span
            v-else
            class="editable-text"
            :class="{ 'clickable': editable, 'placeholder-text': editable && (!element.name || element.name === element.identifier) }"
            @click="editable && $emit('start-edit', element, 'name')"
          >{{ element.name && element.name !== element.identifier ? element.name : (editable ? 'Click to add name...' : '') }}</span>
        </div>

        <!-- Description (inline editable) -->
        <div class="req-cell req-cell-desc">
          <div
            v-if="isEditing(element.id, 'description')"
            class="inline-edit"
            @click.stop
          >
            <el-input
              :model-value="editingValue"
              type="textarea"
              :rows="3"
              @update:model-value="$emit('update-edit-value', $event)"
              @keydown.escape="$emit('cancel-edit')"
            />
            <div class="inline-edit-actions">
              <el-button size="small" type="primary" link @click="$emit('save-edit', element)">&#10003;</el-button>
              <el-button size="small" link @click="$emit('cancel-edit')">&#10005;</el-button>
            </div>
          </div>
          <span
            v-else
            class="editable-text req-description"
            :class="{ 'clickable': editable, 'placeholder-text': editable && !element.description }"
            @click="editable && $emit('start-edit', element, 'description')"
          >{{ element.description || (editable ? 'Click to add description...' : '') }}</span>
        </div>

        <!-- Actions -->
        <div class="req-cell req-cell-actions" v-if="editable">
          <IconButton
            :icon="EditIcon"
            variant="primary"
            :tooltip="t('common.edit')"
            @click="$emit('edit', element)"
          />
          <IconButton
            :icon="Delete"
            variant="danger"
            :tooltip="t('common.delete')"
            @click="$emit('delete', element)"
          />
        </div>
      </div>

      <!-- Drop zone: "Make this a root" or "Make child of this node" indicator -->
      <div
        v-if="editable && dragNodeId && dragNodeId !== element.id && element.children?.length === 0"
        class="drop-zone-child"
        @dragover.prevent="dropZoneTargetId = element.id"
        @dragleave="dropZoneTargetId = null"
        @drop.prevent="onDropAsChild($event, element)"
        :class="{ 'drop-zone-active': dropZoneTargetId === element.id }"
      >
        <span>Drop here to make child of {{ element.identifier }}</span>
      </div>

      <!-- Recursive children -->
      <div v-if="element.children?.length && isExpanded(element.id)" class="req-tree-children">
        <RequirementGroup
          :items="element.children"
          :parent-id="element.id"
          :depth="depth + 1"
          :editable="editable"
          :editing-field="editingField"
          :editing-value="editingValue"
          :drag-node-id="dragNodeId"
          @start-edit="(row: any, field: string) => $emit('start-edit', row, field)"
          @save-edit="(row: any) => $emit('save-edit', row)"
          @cancel-edit="$emit('cancel-edit')"
          @update-edit-value="$emit('update-edit-value', $event)"
          @delete="$emit('delete', $event)"
          @edit="$emit('edit', $event)"
          @reparent="(reqId: string, newParent: string | null) => $emit('reparent', reqId, newParent)"
          @drag-start="(id: string) => $emit('drag-start', id)"
          @drag-end="$emit('drag-end')"
        />
      </div>
    </div>

    <!-- Drop zone at end of root level to make items root-level -->
    <div
      v-if="editable && dragNodeId && depth === 0"
      class="drop-zone-root"
      @dragover.prevent="dropRootActive = true"
      @dragleave="dropRootActive = false"
      @drop.prevent="onDropAsRoot"
      :class="{ 'drop-zone-active': dropRootActive }"
    >
      <span>{{ t('dropZones.makeRootLevel') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Edit as EditIcon, Delete, ArrowRight } from '@element-plus/icons-vue'
import IconButton from './IconButton.vue'
import type { RequirementNode } from './RequirementTree.vue'

// Alias for compatibility
type RequirementItem = RequirementNode

const { t } = useI18n()

const props = defineProps<{
  items: RequirementItem[]
  parentId: string | null
  depth: number
  editable: boolean
  editingField: { id: string; field: string } | null
  editingValue: string
  dragNodeId: string | null
}>()

const emit = defineEmits<{
  (e: 'start-edit', row: RequirementItem, field: string): void
  (e: 'save-edit', row: RequirementItem): void
  (e: 'cancel-edit'): void
  (e: 'update-edit-value', value: string): void
  (e: 'delete', row: RequirementItem): void
  (e: 'edit', row: RequirementItem): void
  (e: 'reparent', requirementId: string, newParentId: string | null): void
  (e: 'drag-start', id: string): void
  (e: 'drag-end'): void
}>()

// Expand/collapse state
const expandedIds = reactive(new Set<string>())

// Default all expanded
const initExpand = () => {
  for (const item of props.items) {
    if (item.children?.length) {
      expandedIds.add(item.id)
    }
  }
}
initExpand()

watch(() => props.items, () => {
  for (const item of props.items) {
    if (item.children?.length && !expandedIds.has(item.id)) {
      expandedIds.add(item.id)
    }
  }
}, { deep: true })

const isExpanded = (id: string) => expandedIds.has(id)
const toggleExpand = (id: string) => {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}

const isEditing = (id: string, field: string) => {
  return props.editingField?.id === id && props.editingField?.field === field
}

// Drag/drop for reparenting
const dropTargetId = ref<string | null>(null)
const dropZoneTargetId = ref<string | null>(null)
const dropRootActive = ref(false)

const onDragStart = (event: DragEvent, element: RequirementItem) => {
  if (!props.editable) return
  event.dataTransfer!.effectAllowed = 'move'
  event.dataTransfer!.setData('text/plain', element.id)
  emit('drag-start', element.id)
}

const onDragEnd = () => {
  dropTargetId.value = null
  dropZoneTargetId.value = null
  dropRootActive.value = false
  emit('drag-end')
}

const onDragOver = (event: DragEvent, element: RequirementItem) => {
  if (props.dragNodeId === element.id) return
  dropTargetId.value = element.id
}

const onDragLeave = (element: RequirementItem) => {
  if (dropTargetId.value === element.id) {
    dropTargetId.value = null
  }
}

const onDrop = (event: DragEvent, element: RequirementItem) => {
  const draggedId = event.dataTransfer?.getData('text/plain')
  dropTargetId.value = null
  if (!draggedId || draggedId === element.id) return

  // Dropping ON a row means "make it a child of this row"
  emit('reparent', draggedId, element.id)
}

const onDropAsChild = (event: DragEvent, element: RequirementItem) => {
  const draggedId = event.dataTransfer?.getData('text/plain')
  dropZoneTargetId.value = null
  if (!draggedId || draggedId === element.id) return
  emit('reparent', draggedId, element.id)
}

const onDropAsRoot = (event: DragEvent) => {
  const draggedId = event.dataTransfer?.getData('text/plain')
  dropRootActive.value = false
  if (!draggedId) return
  emit('reparent', draggedId, null)
}
</script>

<style scoped lang="scss">
.req-tree-row {
  display: flex;
  border-bottom: 1px solid var(--cat-border-default);
  min-height: 44px;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--cat-bg-secondary);
  }

  &.req-tree-row-stripe {
    background-color: var(--cat-bg-tertiary, rgba(255,255,255,0.02));
  }

  &.drop-target {
    outline: 2px dashed var(--cat-accent-primary);
    outline-offset: -2px;
    background-color: rgba(99, 102, 241, 0.1);
  }

  &.is-dragging {
    opacity: 0.4;
  }

  &[draggable="true"] {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
}

.req-cell {
  padding: 8px 12px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.req-cell-drag {
  width: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.req-cell-id {
  width: 160px;
  flex-shrink: 0;
  font-weight: var(--cat-font-weight-medium);
  font-size: var(--cat-font-size-sm);
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
  gap: 4px;
}

.drag-handle {
  color: var(--cat-text-tertiary);
  font-size: 14px;
  user-select: none;
  padding: 2px 4px;
  border-radius: var(--cat-radius-sm);

  &:hover {
    color: var(--cat-text-primary);
    background-color: var(--cat-bg-secondary);
  }
}

.tree-toggle {
  cursor: pointer;
  user-select: none;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--cat-text-tertiary);
  flex-shrink: 0;
  border-radius: var(--cat-radius-sm);
  transition: transform 0.2s ease, color 0.15s;

  &:hover {
    color: var(--cat-text-primary);
    background-color: var(--cat-bg-secondary);
  }

  &.tree-toggle-open {
    transform: rotate(90deg);
  }
}

.tree-toggle-placeholder {
  width: 16px;
  display: inline-block;
  flex-shrink: 0;
}

.tree-indent {
  display: inline-block;
  flex-shrink: 0;
}

.editable-text {
  color: var(--cat-text-primary);
  min-height: 20px;
  display: inline-block;

  &.clickable {
    cursor: pointer;
    border-radius: var(--cat-radius-sm);
    padding: 1px 4px;
    margin: -1px -4px;

    &:hover {
      background-color: var(--cat-bg-tertiary, rgba(255,255,255,0.05));
    }
  }

  &.placeholder-text {
    color: var(--cat-text-tertiary);
    font-style: italic;
    font-size: var(--cat-font-size-sm);
  }
}

.req-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.inline-edit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.inline-edit-actions {
  display: flex;
  gap: 4px;
}

.drop-zone-child,
.drop-zone-root {
  padding: 6px 12px;
  text-align: center;
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-tertiary);
  border: 1px dashed transparent;
  transition: all 0.15s;
  display: none;
}

// Only show drop zones while dragging (controlled by dragNodeId prop)
.requirement-group:has(.is-dragging) .drop-zone-child,
.requirement-group:has(.is-dragging) .drop-zone-root {
  display: block;
}

.drop-zone-active {
  display: block !important;
  border-color: var(--cat-accent-primary);
  background-color: rgba(99, 102, 241, 0.1);
  color: var(--cat-accent-primary);
}

.req-tree-children {
  // Children are visually indented via tree-indent in each row
}
</style>
