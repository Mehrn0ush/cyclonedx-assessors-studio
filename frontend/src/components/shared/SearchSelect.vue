<template>
  <div class="search-select" ref="containerRef">
    <div
      class="search-select__trigger"
      :class="{ 'is-focused': isOpen, 'is-disabled': disabled, 'has-value': !!selectedOption }"
      @click="toggleDropdown"
    >
      <span v-if="selectedOption" class="search-select__value">{{ selectedOption.label }}</span>
      <span v-else class="search-select__placeholder">{{ placeholder }}</span>
      <span class="search-select__arrow" :class="{ 'is-open': isOpen }">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen"
        class="search-select__dropdown"
        ref="dropdownRef"
        :style="dropdownStyle"
      >
        <div class="search-select__search">
          <svg class="search-select__search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M6.333 11.333a5 5 0 100-10 5 5 0 000 10zM13 13l-2.9-2.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-select__search-input"
            type="text"
            :placeholder="searchPlaceholder"
            @input="handleSearch"
            @keydown.down.prevent="highlightNext"
            @keydown.up.prevent="highlightPrev"
            @keydown.enter.prevent="selectHighlighted"
            @keydown.escape="close"
          />
          <button
            v-if="searchQuery"
            class="search-select__search-clear"
            @click.stop="clearSearch"
            aria-label="Clear search"
          >&times;</button>
        </div>

        <div class="search-select__options" ref="optionsRef">
          <div v-if="loading" class="search-select__status">
            <span class="search-select__spinner"></span>
            Searching...
          </div>
          <div v-else-if="filteredOptions.length === 0" class="search-select__status">
            {{ searchQuery ? 'No results found' : 'No options available' }}
          </div>
          <div
            v-else
            v-for="(option, index) in filteredOptions"
            :key="option.value"
            class="search-select__option"
            :class="{
              'is-highlighted': index === highlightedIndex,
              'is-selected': option.value === modelValue,
            }"
            @mouseenter="highlightedIndex = index"
            @click="selectOption(option)"
          >
            <span class="search-select__option-label">{{ option.label }}</span>
            <span v-if="option.description" class="search-select__option-desc">{{ option.description }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

export interface SelectOption {
  value: string
  label: string
  description?: string
}

interface Props {
  modelValue: string
  options?: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  loading?: boolean
  remote?: boolean
  remoteMethod?: (query: string) => void
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  placeholder: 'Select...',
  searchPlaceholder: 'Search...',
  disabled: false,
  loading: false,
  remote: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'search': [query: string]
}>()

const containerRef = ref<HTMLElement>()
const dropdownRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const optionsRef = ref<HTMLElement>()

const isOpen = ref(false)
const searchQuery = ref('')
const highlightedIndex = ref(0)
const dropdownStyle = ref<Record<string, string>>({})

const selectedOption = computed(() => {
  return props.options.find(o => o.value === props.modelValue) || null
})

const filteredOptions = computed(() => {
  if (props.remote || !searchQuery.value) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter(o =>
    o.label.toLowerCase().includes(q) ||
    (o.description && o.description.toLowerCase().includes(q))
  )
})

const positionDropdown = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const dropdownHeight = 300
  const spaceBelow = viewportHeight - rect.bottom
  const openAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow

  dropdownStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: '9999',
    ...(openAbove
      ? { bottom: `${viewportHeight - rect.top + 4}px` }
      : { top: `${rect.bottom + 4}px` }),
  }
}

const toggleDropdown = () => {
  if (props.disabled) return
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

const open = () => {
  isOpen.value = true
  highlightedIndex.value = 0
  searchQuery.value = ''
  positionDropdown()
  nextTick(() => {
    searchInputRef.value?.focus()
  })
  // If remote and no options loaded yet, trigger initial search
  if (props.remote && props.options.length === 0 && props.remoteMethod) {
    props.remoteMethod('')
  }
}

const close = () => {
  isOpen.value = false
  searchQuery.value = ''
}

const clearSearch = () => {
  searchQuery.value = ''
  searchInputRef.value?.focus()
  if (props.remote && props.remoteMethod) {
    props.remoteMethod('')
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const handleSearch = () => {
  highlightedIndex.value = 0
  if (props.remote && props.remoteMethod) {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      props.remoteMethod!(searchQuery.value)
    }, 250)
  }
  emit('search', searchQuery.value)
}

const selectOption = (option: SelectOption) => {
  emit('update:modelValue', option.value)
  close()
}

const selectHighlighted = () => {
  if (filteredOptions.value.length > 0 && highlightedIndex.value < filteredOptions.value.length) {
    selectOption(filteredOptions.value[highlightedIndex.value])
  }
}

const highlightNext = () => {
  if (highlightedIndex.value < filteredOptions.value.length - 1) {
    highlightedIndex.value++
    scrollToHighlighted()
  }
}

const highlightPrev = () => {
  if (highlightedIndex.value > 0) {
    highlightedIndex.value--
    scrollToHighlighted()
  }
}

const scrollToHighlighted = () => {
  nextTick(() => {
    const container = optionsRef.value
    if (!container) return
    const highlighted = container.children[highlightedIndex.value] as HTMLElement
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' })
    }
  })
}

const handleClickOutside = (e: MouseEvent) => {
  if (
    containerRef.value && !containerRef.value.contains(e.target as Node) &&
    dropdownRef.value && !dropdownRef.value.contains(e.target as Node)
  ) {
    close()
  }
}

const handleScroll = () => {
  if (isOpen.value) positionDropdown()
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleScroll)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleScroll)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped lang="scss">
.search-select {
  position: relative;
  width: 100%;

  &__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
    padding: 0 12px;
    background-color: var(--cat-bg-surface);
    border: 1px solid var(--cat-border-default);
    border-radius: var(--cat-radius-md, 6px);
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:hover:not(.is-disabled) {
      border-color: var(--cat-border-strong, #6e7681);
    }

    &.is-focused {
      border-color: var(--cat-brand-secondary, #2f81f7);
      box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
    }

    &.is-disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__value {
    flex: 1;
    color: var(--cat-text-primary, #e6edf3);
    font-size: var(--cat-font-size-sm, 0.8125rem);
    line-height: 30px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__placeholder {
    flex: 1;
    color: var(--cat-text-disabled, #6e7681);
    font-size: var(--cat-font-size-sm, 0.8125rem);
    line-height: 30px;
  }

  &__arrow {
    display: flex;
    align-items: center;
    margin-left: 8px;
    color: var(--cat-text-tertiary, #8b949e);
    transition: transform 0.2s;

    &.is-open {
      transform: rotate(180deg);
    }
  }
}

.search-select__dropdown {
  background-color: var(--cat-bg-surface, #161b22);
  border: 1px solid var(--cat-border-default, #30363d);
  border-radius: var(--cat-radius-md, 6px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.search-select__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cat-border-subtle, #21262d);

  &-icon {
    flex-shrink: 0;
    color: var(--cat-text-tertiary, #8b949e);
  }

  &-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--cat-text-primary, #e6edf3);
    font-size: var(--cat-font-size-sm, 0.8125rem);
    font-family: inherit;
    line-height: 24px;

    &::placeholder {
      color: var(--cat-text-disabled, #6e7681);
    }
  }

  &-clear {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--cat-text-tertiary, #8b949e);
    font-size: 16px;
    cursor: pointer;

    &:hover {
      background-color: var(--cat-bg-hover, #21262d);
      color: var(--cat-text-primary, #e6edf3);
    }
  }
}

.search-select__options {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}

.search-select__option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.1s;

  &.is-highlighted {
    background-color: var(--cat-bg-hover, #21262d);
  }

  &.is-selected {
    .search-select__option-label {
      color: var(--cat-brand-secondary, #2f81f7);
      font-weight: var(--cat-font-weight-medium, 500);
    }
  }

  &-label {
    color: var(--cat-text-primary, #e6edf3);
    font-size: var(--cat-font-size-sm, 0.8125rem);
    line-height: 1.4;
  }

  &-desc {
    color: var(--cat-text-tertiary, #8b949e);
    font-size: var(--cat-font-size-xs, 0.75rem);
    line-height: 1.3;
  }
}

.search-select__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  color: var(--cat-text-tertiary, #8b949e);
  font-size: var(--cat-font-size-sm, 0.8125rem);
}

.search-select__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--cat-border-default, #30363d);
  border-top-color: var(--cat-brand-secondary, #2f81f7);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
