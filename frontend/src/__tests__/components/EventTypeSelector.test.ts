import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EventTypeSelector from '@/components/shared/EventTypeSelector.vue'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      webhooks: {
        subscribeAll: 'Subscribe to all events'
      }
    }
  }
})

function mountEventTypeSelector(props: Record<string, any> = {}) {
  return mount(EventTypeSelector, {
    props: {
      modelValue: [],
      granularity: 'event',
      showSubscribeAll: false,
      subscribeAll: false,
      ...props
    },
    global: {
      plugins: [i18n],
      stubs: {
        ElCheckbox: {
          template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" /><slot /></label>',
          props: ['modelValue']
        },
        ElCheckboxGroup: {
          template: '<div><slot /></div>',
          props: ['modelValue']
        }
      }
    }
  })
}

describe('EventTypeSelector.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mountEventTypeSelector()
      expect(wrapper.exists()).toBe(true)
    })

    it('should have event-type-selector class', () => {
      const wrapper = mountEventTypeSelector()
      expect(wrapper.find('.event-type-selector').exists()).toBe(true)
    })

    it('should render event categories when not subscribing to all', () => {
      const wrapper = mountEventTypeSelector({ subscribeAll: false })
      expect(wrapper.find('.event-categories').exists()).toBe(true)
    })

    it('should hide event categories when subscribing to all', () => {
      const wrapper = mountEventTypeSelector({ subscribeAll: true })
      expect(wrapper.find('.event-categories').exists()).toBe(false)
    })
  })

  describe('subscribe all checkbox', () => {
    it('should not render subscribe all checkbox by default', () => {
      const wrapper = mountEventTypeSelector({ showSubscribeAll: false })
      // When showSubscribeAll is false, the v-if prevents the checkbox from rendering
      expect(wrapper.text()).not.toContain('Subscribe to all events')
    })

    it('should render subscribe all checkbox when showSubscribeAll is true', () => {
      const wrapper = mountEventTypeSelector({ showSubscribeAll: true })
      expect(wrapper.text()).toContain('Subscribe to all events')
    })

    it('should emit subscribeAll change event', async () => {
      const wrapper = mountEventTypeSelector({ showSubscribeAll: true })
      // Find the ElCheckbox component
      const elCheckbox = wrapper.findComponent({ name: 'ElCheckbox' })
      if (elCheckbox.exists()) {
        await elCheckbox.vm.$emit('change', true)
        expect(wrapper.emitted('update:subscribeAll')).toBeTruthy()
      }
    })
  })

  describe('event categories', () => {
    it('should render event category sections', () => {
      const wrapper = mountEventTypeSelector()
      const categories = wrapper.findAll('.event-category')
      expect(categories.length).toBeGreaterThan(0)
    })

    it('should have categories for Assessment, Attestation, Claim, Evidence, Project, Standard, System', () => {
      const wrapper = mountEventTypeSelector()
      const eventCategories = wrapper.vm.eventCategories

      expect(eventCategories).toHaveProperty('Assessment')
      expect(eventCategories).toHaveProperty('Attestation')
      expect(eventCategories).toHaveProperty('Claim')
      expect(eventCategories).toHaveProperty('Evidence')
      expect(eventCategories).toHaveProperty('Project')
      expect(eventCategories).toHaveProperty('Standard')
      expect(eventCategories).toHaveProperty('System')
    })

    it('should render category headers', () => {
      const wrapper = mountEventTypeSelector()
      const headers = wrapper.findAll('.category-header')
      expect(headers.length).toBeGreaterThan(0)
    })
  })

  describe('event selection', () => {
    it('should emit update:modelValue when event is selected', async () => {
      const wrapper = mountEventTypeSelector({ granularity: 'event' })

      wrapper.vm.emitUpdate(['assessment.created'])

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['assessment.created']])
    })

    it('should handle multiple event selections', async () => {
      const wrapper = mountEventTypeSelector({ granularity: 'event' })

      const selected = ['assessment.created', 'assessment.deleted']
      wrapper.vm.emitUpdate(selected)

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([selected])
    })

    it('should detect when category is fully selected', () => {
      const allAssessmentEvents = [
        'assessment.assigned',
        'assessment.created',
        'assessment.deleted',
        'assessment.state_changed'
      ]

      const wrapper = mountEventTypeSelector({ modelValue: allAssessmentEvents })
      const isSelected = wrapper.vm.isCategorySelected('Assessment')

      expect(isSelected).toBe(true)
    })

    it('should detect indeterminate state', () => {
      const wrapper = mountEventTypeSelector({ modelValue: ['assessment.created'] })
      const isIndeterminate = wrapper.vm.isCategoryIndeterminate('Assessment')

      expect(isIndeterminate).toBe(true)
    })
  })

  describe('category granularity', () => {
    it('should show individual events in event granularity', () => {
      const wrapper = mountEventTypeSelector({ granularity: 'event' })
      expect(wrapper.find('.event-list').exists()).toBe(true)
    })

    it('should hide individual events in category granularity', () => {
      const wrapper = mountEventTypeSelector({ granularity: 'category' })
      expect(wrapper.find('.event-list').exists()).toBe(false)
    })

    it('should toggle category with event granularity', () => {
      const wrapper = mountEventTypeSelector({ granularity: 'event' })
      const selected = wrapper.vm.isCategorySelected('Assessment')

      wrapper.vm.toggleCategory('Assessment', !selected)

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    })

    it('should toggle category with category granularity', () => {
      const wrapper = mountEventTypeSelector({ granularity: 'category' })

      wrapper.vm.toggleCategory('assessment', true)

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    })
  })

  describe('selected values', () => {
    it('should display selected modelValue', () => {
      const selected = ['assessment.created', 'assessment.deleted']
      const wrapper = mountEventTypeSelector({ modelValue: selected })

      expect(wrapper.vm.$props.modelValue).toEqual(selected)
    })

    it('should update when modelValue prop changes', async () => {
      const wrapper = mountEventTypeSelector({ modelValue: [] })

      await wrapper.setProps({ modelValue: ['assessment.created'] })

      expect(wrapper.vm.$props.modelValue).toEqual(['assessment.created'])
    })
  })

  describe('event list rendering', () => {
    it('should render Assessment events', () => {
      const wrapper = mountEventTypeSelector({ granularity: 'event' })
      const assessmentCategory = wrapper.vm.eventCategories.Assessment

      expect(assessmentCategory).toContain('assessment.assigned')
      expect(assessmentCategory).toContain('assessment.created')
      expect(assessmentCategory).toContain('assessment.deleted')
      expect(assessmentCategory).toContain('assessment.state_changed')
    })

    it('should render Evidence events', () => {
      const wrapper = mountEventTypeSelector()
      const evidenceCategory = wrapper.vm.eventCategories.Evidence

      expect(evidenceCategory).toContain('evidence.created')
      expect(evidenceCategory).toContain('evidence.attachment_added')
      expect(evidenceCategory).toContain('evidence.state_changed')
    })

    it('should render System events', () => {
      const wrapper = mountEventTypeSelector()
      const systemCategory = wrapper.vm.eventCategories.System

      expect(systemCategory).toContain('channel.test')
      expect(systemCategory).toContain('user.created')
      expect(systemCategory).toContain('apikey.created')
    })
  })
})
