import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import SearchSelect from '@/components/shared/SearchSelect.vue'
import { nextTick } from 'vue'

const mockOptions = [
  { value: 'opt1', label: 'Option 1', description: 'First option' },
  { value: 'opt2', label: 'Option 2', description: 'Second option' },
  { value: 'opt3', label: 'Option 3', description: 'Third option' },
  { value: 'opt4', label: 'Another Choice' }
]

/**
 * Helper to mount SearchSelect with Teleport stubbed out so the dropdown
 * renders inline (inside the wrapper) instead of being teleported to <body>.
 */
function mountSearchSelect(propsOverrides: Record<string, unknown> = {}) {
  return mount(SearchSelect, {
    props: {
      modelValue: '',
      options: mockOptions,
      ...propsOverrides
    },
    global: {
      stubs: {
        Teleport: true
      }
    }
  })
}

describe('SearchSelect.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mountSearchSelect()
      expect(wrapper.exists()).toBe(true)
    })

    it('should have search-select class', () => {
      const wrapper = mountSearchSelect()
      expect(wrapper.find('.search-select').exists()).toBe(true)
    })

    it('should render trigger element', () => {
      const wrapper = mountSearchSelect()
      expect(wrapper.find('.search-select__trigger').exists()).toBe(true)
    })
  })

  describe('placeholder', () => {
    it('should render placeholder when no option selected', async () => {
      const wrapper = mountSearchSelect({ placeholder: 'Select an option' })
      expect(wrapper.text()).toContain('Select an option')
    })

    it('should use default placeholder', async () => {
      const wrapper = mountSearchSelect()
      expect(wrapper.text()).toContain('Select...')
    })

    it('should not show placeholder when option is selected', async () => {
      const wrapper = mountSearchSelect({ modelValue: 'opt1' })
      expect(wrapper.find('.search-select__placeholder').exists()).toBe(false)
    })
  })

  describe('selection display', () => {
    it('should display selected option label', () => {
      const wrapper = mountSearchSelect({ modelValue: 'opt1' })
      expect(wrapper.text()).toContain('Option 1')
    })

    it('should show selected value when dropdown is closed', () => {
      const wrapper = mountSearchSelect({ modelValue: 'opt2' })
      expect(wrapper.find('.search-select__value').exists()).toBe(true)
      expect(wrapper.find('.search-select__value').text()).toBe('Option 2')
    })

    it('should add has-value class when value is selected', () => {
      const wrapper = mountSearchSelect({ modelValue: 'opt1' })
      expect(wrapper.find('.search-select__trigger').classes()).toContain('has-value')
    })
  })

  describe('dropdown toggle', () => {
    it('should open dropdown when trigger is clicked', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.vm.isOpen).toBe(true)
    })

    it('should close dropdown when already open', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()
      expect(wrapper.vm.isOpen).toBe(true)

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()
      expect(wrapper.vm.isOpen).toBe(false)
    })

    it('should add is-focused class when dropdown is open', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.find('.search-select__trigger').classes()).toContain('is-focused')
    })

    it('should not open dropdown when disabled', async () => {
      const wrapper = mountSearchSelect({ disabled: true })

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.vm.isOpen).toBe(false)
    })

    it('should add is-disabled class when disabled', () => {
      const wrapper = mountSearchSelect({ disabled: true })
      expect(wrapper.find('.search-select__trigger').classes()).toContain('is-disabled')
    })
  })

  describe('search functionality', () => {
    it('should filter options based on search input', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('Option 1')
      await nextTick()

      expect(wrapper.vm.filteredOptions.length).toBe(1)
      expect(wrapper.vm.filteredOptions[0].value).toBe('opt1')
    })

    it('should perform case insensitive search', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('OPTION')
      await nextTick()

      expect(wrapper.vm.filteredOptions.length).toBeGreaterThan(0)
      expect(wrapper.vm.filteredOptions.some((o: any) => o.label.includes('Option'))).toBe(true)
    })

    it('should search in label and description', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('First')
      await nextTick()

      expect(wrapper.vm.filteredOptions.length).toBe(1)
      expect(wrapper.vm.filteredOptions[0].value).toBe('opt1')
    })

    it('should return all options when search is empty', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.vm.filteredOptions.length).toBe(mockOptions.length)
    })

    it('should show no results message when filter matches nothing', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('nonexistent')
      await nextTick()

      expect(wrapper.text()).toContain('No results found')
    })

    it('should clear search when button is clicked', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('Option')
      await nextTick()

      expect(wrapper.vm.searchQuery).toBe('Option')

      const clearBtn = wrapper.find('.search-select__search-clear')
      await clearBtn.trigger('click')
      await nextTick()

      expect(wrapper.vm.searchQuery).toBe('')
    })
  })

  describe('option selection', () => {
    it('should emit update:modelValue on selection', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const option = wrapper.find('.search-select__option')
      await option.trigger('click')
      await nextTick()

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['opt1'])
    })

    it('should close dropdown after selection', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const option = wrapper.find('.search-select__option')
      await option.trigger('click')
      await nextTick()

      expect(wrapper.vm.isOpen).toBe(false)
    })

    it('should clear search after selection', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('Option')
      await nextTick()

      const option = wrapper.find('.search-select__option')
      await option.trigger('click')
      await nextTick()

      expect(wrapper.vm.searchQuery).toBe('')
    })

    it('should highlight selected option', async () => {
      const wrapper = mountSearchSelect({ modelValue: 'opt1' })

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const selectedOption = wrapper.find('.search-select__option.is-selected')
      expect(selectedOption.exists()).toBe(true)
    })
  })

  describe('keyboard navigation', () => {
    it('should select option on enter key', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.trigger('keydown.enter')
      await nextTick()

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    })

    it('should close dropdown on escape key', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.trigger('keydown.escape')
      await nextTick()

      expect(wrapper.vm.isOpen).toBe(false)
    })
  })

  describe('loading state', () => {
    it('should show loading spinner when loading prop is true', async () => {
      const wrapper = mountSearchSelect({ loading: true })

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.text()).toContain('Searching...')
      expect(wrapper.find('.search-select__spinner').exists()).toBe(true)
    })

    it('should hide options when loading', async () => {
      const wrapper = mountSearchSelect({ loading: true })

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.findAll('.search-select__option').length).toBe(0)
    })
  })

  describe('search event', () => {
    it('should emit search event on input', async () => {
      const wrapper = mountSearchSelect()

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('.search-select__search-input')
      await searchInput.setValue('test')
      await nextTick()

      expect(wrapper.emitted('search')).toBeTruthy()
      expect(wrapper.emitted('search')?.[0]).toEqual(['test'])
    })
  })

  describe('arrow rotation', () => {
    it('should rotate arrow when dropdown is open', async () => {
      const wrapper = mountSearchSelect()

      const arrow = wrapper.find('.search-select__arrow')
      expect(arrow.classes()).not.toContain('is-open')

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(arrow.classes()).toContain('is-open')
    })
  })

  describe('empty options', () => {
    it('should show no options message with empty array', async () => {
      const wrapper = mountSearchSelect({ options: [] })

      await wrapper.find('.search-select__trigger').trigger('click')
      await nextTick()

      expect(wrapper.text()).toContain('No options available')
    })
  })
})
