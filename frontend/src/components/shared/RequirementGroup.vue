<template>
  <div class="requirement-group">
    <div
      v-for="element in items"
      :key="element.id"
      class="req-tree-node"
    >
      <div
        class="req-tree-row"
        :data-req-id="element.id"
        :class="{
          'req-tree-row-stripe': items.indexOf(element) % 2 === 1,
          'drop-target': dropTargetId === element.id,
          'is-dragging': dragNodeId === element.id,
        }"
      >
        <!-- Drag handle -->
        <div class="req-cell req-cell-drag" v-if="editable">
          <span
            class="drag-handle"
            title="Drag to reparent"
            @pointerdown.stop.prevent="startPointerDrag($event, element)"
          >&#x2630;</span>
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
          :drop-target-id="dropTargetId"
          @start-edit="(row: RequirementItem, field: string) => $emit('start-edit', row, field)"
          @save-edit="(row: RequirementItem) => $emit('save-edit', row)"
          @cancel-edit="$emit('cancel-edit')"
          @update-edit-value="$emit('update-edit-value', $event)"
          @delete="$emit('delete', $event)"
          @edit="$emit('edit', $event)"
          @reparent="(reqId: string, newParent: string | null) => $emit('reparent', reqId, newParent)"
          @drag-start="(id: string) => $emit('drag-start', id)"
          @drag-end="$emit('drag-end')"
          @drag-hover="(id: string | null) => $emit('drag-hover', id)"
        />
      </div>
    </div>

    <!-- "Make root" hint strip, visible during drag at the end of the root list -->
    <div
      v-if="editable && dragNodeId && depth === 0"
      class="drop-zone-root"
      :class="{ 'drop-zone-active': dropTargetId === ROOT_TARGET_ID }"
      :data-req-id="ROOT_TARGET_ID"
    >
      <span>{{ t('dropZones.makeRootLevel') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Edit as EditIcon, Delete, ArrowRight } from '@element-plus/icons-vue'
import IconButton from './IconButton.vue'
import type { RequirementNode } from './RequirementTree.vue'

// Alias for compatibility
type RequirementItem = RequirementNode

const { t } = useI18n()

// Sentinel drop-target id for the "make root" strip. A literal string
// we will never collide with a real requirement UUID.
const ROOT_TARGET_ID = '__REQ_TREE_ROOT__'

const props = defineProps<{
  items: RequirementItem[]
  parentId: string | null
  depth: number
  editable: boolean
  editingField: { id: string; field: string } | null
  editingValue: string
  dragNodeId: string | null
  dropTargetId: string | null
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
  (e: 'drag-hover', id: string | null): void
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

// --- Pointer-based drag implementation ---
//
// Why not HTML5 native drag-and-drop? The app shell puts the primary
// scroll on `.app-main` inside a position:fixed wrapper. Native drag
// does not reliably work in that layout, and in particular it does not
// auto-scroll nested overflow containers, so drops on rows that are
// below the initially visible viewport silently fail in some browsers.
// Pointer events bypass all of that: we track the pointer globally,
// hit-test with `document.elementFromPoint`, and scroll the container
// ourselves when the cursor gets near the top or bottom edge.

const AUTO_SCROLL_EDGE_PX = 60
const AUTO_SCROLL_STEP_PX = 18
const DRAG_THRESHOLD_PX = 4

let activeDragId: string | null = null
let dragStarted = false
let pointerStartX = 0
let pointerStartY = 0
let scrollContainerEl: HTMLElement | null = null
let capturedEl: HTMLElement | null = null
let capturedPointerId: number | null = null
let autoScrollRAF: number | null = null
let lastClientX = 0
let lastClientY = 0

const getAppMain = (): HTMLElement | null => {
  if (scrollContainerEl && scrollContainerEl.isConnected) return scrollContainerEl
  scrollContainerEl = document.querySelector('.app-main')
  return scrollContainerEl
}

const hitTestReqId = (clientX: number, clientY: number): string | null => {
  const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (!target) return null
  const row = target.closest('[data-req-id]') as HTMLElement | null
  if (!row) return null
  const id = row.getAttribute('data-req-id')
  return id || null
}

const autoScrollTick = () => {
  autoScrollRAF = null
  if (!activeDragId) return
  const container = getAppMain()
  if (!container) return
  const rect = container.getBoundingClientRect()
  let scrolled = false
  if (lastClientY < rect.top + AUTO_SCROLL_EDGE_PX) {
    const distance = rect.top + AUTO_SCROLL_EDGE_PX - lastClientY
    const step = Math.min(AUTO_SCROLL_STEP_PX, Math.max(2, distance / 4))
    const next = Math.max(0, container.scrollTop - step)
    if (next !== container.scrollTop) {
      container.scrollTop = next
      scrolled = true
    }
  } else if (lastClientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
    const distance = lastClientY - (rect.bottom - AUTO_SCROLL_EDGE_PX)
    const step = Math.min(AUTO_SCROLL_STEP_PX, Math.max(2, distance / 4))
    const maxScroll = container.scrollHeight - container.clientHeight
    const next = Math.min(maxScroll, container.scrollTop + step)
    if (next !== container.scrollTop) {
      container.scrollTop = next
      scrolled = true
    }
  }
  // After scrolling, the element under the cursor has changed. Re-hit-test
  // so the drop-target highlight follows the newly revealed row.
  if (scrolled) {
    const hoverId = hitTestReqId(lastClientX, lastClientY)
    emit('drag-hover', hoverId)
  }
  // Keep the loop alive while dragging so the page continues to scroll
  // even if the user stops moving the pointer inside the edge zone.
  if (activeDragId) {
    autoScrollRAF = requestAnimationFrame(autoScrollTick)
  }
}

const startAutoScroll = () => {
  if (autoScrollRAF !== null) return
  autoScrollRAF = requestAnimationFrame(autoScrollTick)
}

const stopAutoScroll = () => {
  if (autoScrollRAF !== null) {
    cancelAnimationFrame(autoScrollRAF)
    autoScrollRAF = null
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!activeDragId) return
  lastClientX = event.clientX
  lastClientY = event.clientY

  if (!dragStarted) {
    const dx = event.clientX - pointerStartX
    const dy = event.clientY - pointerStartY
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    dragStarted = true
    emit('drag-start', activeDragId)
    startAutoScroll()
  }

  const hoverId = hitTestReqId(event.clientX, event.clientY)
  emit('drag-hover', hoverId)
}

const endDrag = (commit: boolean, event?: PointerEvent) => {
  const draggedId = activeDragId
  activeDragId = null
  const wasStarted = dragStarted
  dragStarted = false
  stopAutoScroll()

  if (capturedEl && capturedPointerId !== null) {
    try {
      capturedEl.releasePointerCapture(capturedPointerId)
    } catch {
      // no-op, capture may already have been released
    }
  }
  capturedEl = null
  capturedPointerId = null

  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerCancel)

  if (!wasStarted || !draggedId) {
    if (wasStarted) emit('drag-end')
    emit('drag-hover', null)
    return
  }

  let targetId: string | null = null
  if (commit && event) {
    targetId = hitTestReqId(event.clientX, event.clientY)
  } else if (commit) {
    targetId = props.dropTargetId
  }

  emit('drag-end')
  emit('drag-hover', null)

  if (!commit) return
  if (!targetId) return
  if (targetId === draggedId) return

  if (targetId === ROOT_TARGET_ID) {
    emit('reparent', draggedId, null)
    return
  }

  emit('reparent', draggedId, targetId)
}

const onPointerUp = (event: PointerEvent) => {
  endDrag(true, event)
}

const onPointerCancel = () => {
  endDrag(false)
}

const startPointerDrag = (event: PointerEvent, element: RequirementItem) => {
  if (!props.editable) return
  if (event.button !== undefined && event.button !== 0) return
  activeDragId = element.id
  dragStarted = false
  pointerStartX = event.clientX
  pointerStartY = event.clientY
  lastClientX = event.clientX
  lastClientY = event.clientY

  // Capture the pointer on the handle so we reliably get subsequent
  // events even if the cursor moves outside the element while dragging.
  capturedEl = event.currentTarget as HTMLElement
  capturedPointerId = event.pointerId
  try {
    capturedEl.setPointerCapture(event.pointerId)
  } catch {
    // Some test environments or very old browsers may not support
    // setPointerCapture. Document listeners still work.
  }

  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerCancel)
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
  cursor: grab;
  touch-action: none;

  &:hover {
    color: var(--cat-text-primary);
    background-color: var(--cat-bg-secondary);
  }

  &:active {
    cursor: grabbing;
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

.drop-zone-root {
  padding: 8px 12px;
  margin-top: 4px;
  text-align: center;
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-tertiary);
  border: 1px dashed var(--cat-border-default);
  border-radius: var(--cat-radius-sm);
  transition: all 0.15s;

  &.drop-zone-active {
    border-color: var(--cat-accent-primary);
    background-color: rgba(99, 102, 241, 0.1);
    color: var(--cat-accent-primary);
  }
}

.req-tree-children {
  // Children are visually indented via tree-indent in each row
}
</style>
