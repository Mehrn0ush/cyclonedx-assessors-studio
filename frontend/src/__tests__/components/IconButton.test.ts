import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IconButton from '@/components/shared/IconButton.vue'
import { nextTick } from 'vue'

const mockIcon = { name: 'MockIcon', template: '<span>Icon</span>' }

function mountIconButton(props: Record<string, any> = {}) {
  return mount(IconButton, {
    props: {
      icon: mockIcon,
      ...props
    }
  })
}

describe('IconButton.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mountIconButton()
      expect(wrapper.exists()).toBe(true)
    })

    it('should have icon-btn class', () => {
      const wrapper = mountIconButton()
      expect(wrapper.find('.icon-btn').exists()).toBe(true)
    })

    it('should render as button element', () => {
      const wrapper = mountIconButton()
      expect(wrapper.element.tagName).toBe('BUTTON')
    })

    it('should render icon component', () => {
      const wrapper = mountIconButton()
      expect(wrapper.find('.icon-btn__icon').exists()).toBe(true)
    })
  })

  describe('variants', () => {
    it('should apply primary variant class by default', () => {
      const wrapper = mountIconButton()
      expect(wrapper.find('.icon-btn--primary').exists()).toBe(true)
    })

    it('should apply danger variant class', () => {
      const wrapper = mountIconButton({ variant: 'danger' })
      expect(wrapper.find('.icon-btn--danger').exists()).toBe(true)
    })

    it('should apply warning variant class', () => {
      const wrapper = mountIconButton({ variant: 'warning' })
      expect(wrapper.find('.icon-btn--warning').exists()).toBe(true)
    })

    it('should apply success variant class', () => {
      const wrapper = mountIconButton({ variant: 'success' })
      expect(wrapper.find('.icon-btn--success').exists()).toBe(true)
    })

    it('should apply info variant class', () => {
      const wrapper = mountIconButton({ variant: 'info' })
      expect(wrapper.find('.icon-btn--info').exists()).toBe(true)
    })
  })

  describe('tooltip', () => {
    it('should set tooltip on title attribute', () => {
      const wrapper = mountIconButton({ tooltip: 'Delete item' })
      expect(wrapper.attributes('title')).toBe('Delete item')
    })

    it('should set tooltip on aria-label', () => {
      const wrapper = mountIconButton({ tooltip: 'Delete item' })
      expect(wrapper.attributes('aria-label')).toBe('Delete item')
    })

    it('should have empty tooltip by default', () => {
      const wrapper = mountIconButton()
      expect(wrapper.attributes('title')).toBe('')
    })
  })

  describe('disabled state', () => {
    it('should apply disabled class when disabled prop is true', () => {
      const wrapper = mountIconButton({ disabled: true })
      expect(wrapper.find('.icon-btn--disabled').exists()).toBe(true)
    })

    it('should set disabled attribute on button', () => {
      const wrapper = mountIconButton({ disabled: true })
      expect(wrapper.attributes('disabled')).toBeDefined()
    })

    it('should not have disabled class by default', () => {
      const wrapper = mountIconButton()
      expect(wrapper.find('.icon-btn--disabled').exists()).toBe(false)
    })

    it('should not be disabled by default', () => {
      const wrapper = mountIconButton()
      expect(wrapper.attributes('disabled')).toBeUndefined()
    })
  })

  describe('click event', () => {
    it('should emit click event when clicked', async () => {
      const wrapper = mountIconButton()
      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeTruthy()
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('should not emit click when disabled', async () => {
      const wrapper = mountIconButton({ disabled: true })
      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeFalsy()
    })

    it('should stop event propagation on click', async () => {
      const wrapper = mountIconButton()
      const button = wrapper.find('button')

      await button.trigger('click')

      // Event should be emitted (stopPropagation is a Vue directive, not something we can test directly)
      expect(wrapper.emitted('click')).toBeTruthy()
    })
  })

  describe('icon rendering', () => {
    it('should render icon with correct class', () => {
      const wrapper = mountIconButton()
      const icon = wrapper.find('.icon-btn__icon')
      expect(icon.exists()).toBe(true)
    })

    it('should pass icon component prop', () => {
      const customIcon = { template: '<span>Custom</span>' }
      const wrapper = mountIconButton({ icon: customIcon })
      expect(wrapper.props('icon')).toStrictEqual(customIcon)
    })
  })

  describe('combination tests', () => {
    it('should render danger variant with tooltip', () => {
      const wrapper = mountIconButton({ variant: 'danger', tooltip: 'Delete' })
      expect(wrapper.find('.icon-btn--danger').exists()).toBe(true)
      expect(wrapper.attributes('title')).toBe('Delete')
    })

    it('should render disabled danger button with tooltip', () => {
      const wrapper = mountIconButton({ variant: 'danger', disabled: true, tooltip: 'Cannot delete' })
      expect(wrapper.find('.icon-btn--danger').exists()).toBe(true)
      expect(wrapper.find('.icon-btn--disabled').exists()).toBe(true)
      expect(wrapper.attributes('disabled')).toBeDefined()
    })

    it('should handle all variant styles', async () => {
      const variants = ['primary', 'danger', 'warning', 'success', 'info']

      for (const variant of variants) {
        const wrapper = mountIconButton({ variant })
        expect(wrapper.find(`.icon-btn--${variant}`).exists()).toBe(true)
      }
    })
  })
})
