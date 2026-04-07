import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatCard from '@/components/shared/StatCard.vue'
import { BarChart } from '@element-plus/icons-vue'

describe('StatCard.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Total Assessments',
          value: 42,
          icon: BarChart
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should render with role="region"', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Active Projects',
          value: 10,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-card').attributes('role')).toBe('region')
    })

    it('should have aria-label with title and value', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Completed Assessments',
          value: 25,
          icon: BarChart
        }
      })

      const ariaLabel = wrapper.find('.stat-card').attributes('aria-label')
      expect(ariaLabel).toContain('Completed Assessments')
      expect(ariaLabel).toContain('25')
    })
  })

  describe('title and value display', () => {
    it('should display title correctly', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Test Title',
          value: 100,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-title').text()).toBe('Test Title')
    })

    it('should display numeric value', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Count',
          value: 42,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('42')
    })

    it('should display string value', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Status',
          value: 'Active',
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('Active')
    })

    it('should handle large numbers', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Large Number',
          value: 1000000,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('1000000')
    })

    it('should handle zero value', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Zero Count',
          value: 0,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('0')
    })
  })

  describe('change indicator', () => {
    it('should display change percentage when change prop is provided', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Assessments',
          value: 50,
          change: 15,
          changeType: 'up',
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-change').text()).toContain('15%')
    })

    it('should display upward indicator when changeType is "up"', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Growth',
          value: 100,
          change: 25,
          changeType: 'up',
          icon: BarChart
        }
      })

      const changeDiv = wrapper.find('.stat-change')
      expect(changeDiv.classes()).toContain('up')
    })

    it('should display downward indicator when changeType is "down"', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Decline',
          value: 80,
          change: 10,
          changeType: 'down',
          icon: BarChart
        }
      })

      const changeDiv = wrapper.find('.stat-change')
      expect(changeDiv.classes()).toContain('down')
    })

    it('should not display change section when change is undefined', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'No Change',
          value: 50,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-change').exists()).toBe(false)
    })

    it('should use absolute value for change display', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Change Test',
          value: 100,
          change: -20,
          changeType: 'down',
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-change').text()).toContain('20%')
    })

    it('should handle zero change', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Stable',
          value: 100,
          change: 0,
          changeType: 'up',
          icon: BarChart
        }
      })

      // change=0 is falsy, so v-if="change" does not render the change section
      expect(wrapper.find('.stat-change').exists()).toBe(false)
    })
  })

  describe('icon display', () => {
    it('should render icon component', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Icon Test',
          value: 42,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-icon').exists()).toBe(true)
    })

    it('should mark icon container with aria-hidden="true"', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Hidden Icon',
          value: 50,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-icon').attributes('aria-hidden')).toBe('true')
    })

    it('should apply accent color to icon', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Colored Icon',
          value: 30,
          icon: BarChart,
          accentColor: 'rgb(255, 0, 0)'
        }
      })

      expect(wrapper.find('.stat-icon').attributes('style')).toContain('rgb(255, 0, 0)')
    })

    it('should use default accent color when not specified', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Default Color',
          value: 20,
          icon: BarChart
        }
      })

      const style = wrapper.find('.stat-icon').attributes('style')
      expect(style).toContain('var(--cat-accent-primary)')
    })
  })

  describe('accent color customization', () => {
    it('should apply custom accent color', () => {
      const customColor = '#FF5733'
      const wrapper = mount(StatCard, {
        props: {
          title: 'Custom Color',
          value: 100,
          icon: BarChart,
          accentColor: customColor
        }
      })

      // jsdom normalizes hex colors to rgb() in computed styles
      const style = wrapper.find('.stat-icon').attributes('style') || ''
      expect(style).toMatch(/rgb\(255, 87, 51\)|#FF5733/i)
    })

    it('should accept CSS variable as accent color', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'CSS Var Color',
          value: 50,
          icon: BarChart,
          accentColor: 'var(--custom-color)'
        }
      })

      expect(wrapper.find('.stat-icon').attributes('style')).toContain('var(--custom-color)')
    })
  })

  describe('layout structure', () => {
    it('should have stat-header section', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Layout Test',
          value: 75,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-header').exists()).toBe(true)
    })

    it('should have stat-body section', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Body Test',
          value: 60,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-body').exists()).toBe(true)
    })

    it('should have stat-value-area', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Value Area',
          value: 80,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value-area').exists()).toBe(true)
    })
  })

  describe('optional props', () => {
    it('should work without change prop', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'No Change',
          value: 50,
          icon: BarChart
        }
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.stat-change').exists()).toBe(false)
    })

    it('should work without accentColor prop', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Default Colors',
          value: 30,
          icon: BarChart
        }
      })

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.stat-icon').exists()).toBe(true)
    })

    it('should work without changeType when change is provided', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'With Change',
          value: 40,
          change: 10,
          icon: BarChart
        }
      })

      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('value types', () => {
    it('should display decimal values', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Decimal',
          value: 42.5,
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('42.5')
    })

    it('should display percentage string', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Percentage',
          value: '85%',
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('85%')
    })

    it('should display date string', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Last Updated',
          value: '2026-04-07',
          icon: BarChart
        }
      })

      expect(wrapper.find('.stat-value').text()).toBe('2026-04-07')
    })
  })

  describe('prop combinations', () => {
    it('should handle all props together', () => {
      const wrapper = mount(StatCard, {
        props: {
          title: 'Full Featured',
          value: 150,
          change: 25,
          changeType: 'up',
          icon: BarChart,
          accentColor: '#3FB950'
        }
      })

      expect(wrapper.find('.stat-title').text()).toBe('Full Featured')
      expect(wrapper.find('.stat-value').text()).toBe('150')
      expect(wrapper.find('.stat-change').text()).toContain('25%')
      // jsdom normalizes hex colors to rgb() in computed styles
      const style = wrapper.find('.stat-icon').attributes('style') || ''
      expect(style).toMatch(/rgb\(63, 185, 80\)|#3FB950/i)
    })
  })
})
