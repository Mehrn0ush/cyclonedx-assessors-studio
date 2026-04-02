<template>
  <div class="tag-input-wrapper">
    <div class="tag-input" @click="focusInput">
      <span
        v-for="tag in modelValue"
        :key="tag"
        class="tag-pill"
      >
        <span class="tag-pill__label">{{ tag }}</span>
        <button
          class="tag-pill__close"
          type="button"
          :aria-label="`Remove tag ${tag}`"
          @click.stop="removeTag(tag)"
        >&times;</button>
      </span>
      <div class="input-wrapper">
        <input
          ref="inputRef"
          v-model="inputText"
          class="tag-input__field"
          type="text"
          :placeholder="modelValue.length === 0 ? placeholder : ''"
          :aria-label="`Tag input. Current tags: ${modelValue.join(', ')}`"
          @keydown.enter.prevent="addTag"
          @keydown.space.prevent="addTag"
          @keydown.delete="handleBackspace"
          @blur="handleBlur"
          @input="handleInput"
        />
      </div>
    </div>
    <div v-if="showSuggestions && suggestions.length > 0" class="tag-suggestions">
      <div
        v-for="suggestion in suggestions"
        :key="suggestion"
        class="suggestion-item"
        @click="selectSuggestion(suggestion)"
      >
        {{ suggestion }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'

interface Props {
  modelValue: string[]
  placeholder?: string
  tagColors?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Type a tag and press space',
  tagColors: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const inputText = ref('')
const inputRef = ref<HTMLInputElement>()
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const focusInput = () => {
  inputRef.value?.focus()
}

const handleInput = () => {
  showSuggestions.value = true

  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  if (inputText.value.trim().length === 0) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  debounceTimer = setTimeout(async () => {
    try {
      const { data } = await axios.get('/api/v1/tags/autocomplete', {
        params: { q: inputText.value.trim() }
      })
      const allSuggestions = data.data || []
      suggestions.value = allSuggestions.filter((tag: string) => !props.modelValue.includes(tag))
    } catch (err) {
      console.error('Failed to fetch tag suggestions:', err)
      suggestions.value = []
    }
  }, 300)
}

const addTag = () => {
  const tag = inputText.value.trim().toLowerCase()
  if (tag && !props.modelValue.includes(tag)) {
    emit('update:modelValue', [...props.modelValue, tag])
  }
  inputText.value = ''
  showSuggestions.value = false
  suggestions.value = []
}

const selectSuggestion = (tag: string) => {
  if (!props.modelValue.includes(tag)) {
    emit('update:modelValue', [...props.modelValue, tag])
  }
  inputText.value = ''
  showSuggestions.value = false
  suggestions.value = []
}

const removeTag = (tag: string) => {
  emit('update:modelValue', props.modelValue.filter(t => t !== tag))
}

const handleBackspace = () => {
  if (inputText.value === '' && props.modelValue.length > 0) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

const handleBlur = () => {
  addTag()
  showSuggestions.value = false
}

</script>

<style scoped lang="scss">
.tag-input-wrapper {
  position: relative;
  width: 100%;
}

.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 8px;
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md, 6px);
  cursor: text;
  transition: border-color 0.2s;
  width: 100%;

  &:focus-within {
    border-color: var(--cat-brand-secondary, #2f81f7);
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
  }
}

.input-wrapper {
  flex: 1;
  min-width: 80px;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: rgba(63, 185, 80, 0.1);
  border: 1px solid rgba(63, 185, 80, 0.4);
  color: #3fb950;
  font-size: var(--cat-font-size-xs, 0.75rem);
  line-height: 1.4;
  white-space: nowrap;

  &__label {
    user-select: none;
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: rgba(63, 185, 80, 0.6);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;

    &:hover {
      background-color: rgba(63, 185, 80, 0.15);
      color: #3fb950;
    }

    &:focus-visible {
      outline: 2px solid var(--cat-brand-secondary, #2f81f7);
      outline-offset: 1px;
    }
  }
}

.tag-input__field {
  width: 100%;
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

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md, 6px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.suggestion-item {
  padding: 8px 12px;
  color: var(--cat-text-primary);
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--cat-bg-hover);
    color: var(--cat-text-primary);
  }
}
</style>
