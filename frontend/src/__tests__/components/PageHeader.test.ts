import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from '@/components/shared/PageHeader.vue'

describe('PageHeader.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Test Title'
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should have page-header class', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Test Title'
        }
      })

      expect(wrapper.find('.page-header').exists()).toBe(true)
    })
  })

  describe('title prop', () => {
    it('should render title text', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'My Page Title'
        }
      })

      expect(wrapper.text()).toContain('My Page Title')
    })

    it('should render title in h1 element', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Test Title'
        }
      })

      const h1 = wrapper.find('.header-title')
      expect(h1.exists()).toBe(true)
      expect(h1.element.tagName).toBe('H1')
      expect(h1.text()).toBe('Test Title')
    })

    it('should handle long titles', () => {
      const longTitle = 'This is a very long title that should still render properly'
      const wrapper = mount(PageHeader, {
        props: {
          title: longTitle
        }
      })

      expect(wrapper.find('.header-title').text()).toBe(longTitle)
    })

    it('should handle special characters in title', () => {
      const titleWithSpecialChars = 'Title with & <special> "characters"'
      const wrapper = mount(PageHeader, {
        props: {
          title: titleWithSpecialChars
        }
      })

      expect(wrapper.find('.header-title').text()).toBe(titleWithSpecialChars)
    })
  })

  describe('subtitle prop', () => {
    it('should render subtitle when provided', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title',
          subtitle: 'This is a subtitle'
        }
      })

      expect(wrapper.text()).toContain('This is a subtitle')
    })

    it('should render subtitle in p element', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title',
          subtitle: 'Subtitle text'
        }
      })

      const subtitle = wrapper.find('.header-subtitle')
      expect(subtitle.exists()).toBe(true)
      expect(subtitle.element.tagName).toBe('P')
      expect(subtitle.text()).toBe('Subtitle text')
    })

    it('should not render subtitle element when subtitle is not provided', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        }
      })

      expect(wrapper.find('.header-subtitle').exists()).toBe(false)
    })

    it('should not render subtitle element when subtitle is empty string', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title',
          subtitle: ''
        }
      })

      expect(wrapper.find('.header-subtitle').exists()).toBe(false)
    })

    it('should handle long subtitles', () => {
      const longSubtitle = 'This is a much longer subtitle that provides additional context and information about the page'
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title',
          subtitle: longSubtitle
        }
      })

      expect(wrapper.find('.header-subtitle').text()).toBe(longSubtitle)
    })
  })

  describe('slots', () => {
    it('should render actions slot content', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        },
        slots: {
          actions: '<button>Action Button</button>'
        }
      })

      expect(wrapper.html()).toContain('Action Button')
    })

    it('should render slot in header-actions div', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        },
        slots: {
          actions: '<span class="action-item">Test Action</span>'
        }
      })

      const actionsDiv = wrapper.find('.header-actions')
      expect(actionsDiv.exists()).toBe(true)
      expect(actionsDiv.html()).toContain('action-item')
    })

    it('should support multiple action elements', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        },
        slots: {
          actions: '<button>Action 1</button><button>Action 2</button><button>Action 3</button>'
        }
      })

      const buttons = wrapper.find('.header-actions').findAll('button')
      expect(buttons.length).toBe(3)
    })

    it('should render slot content with vue components', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        },
        slots: {
          actions: '<div class="custom-action">Custom slot content</div>'
        }
      })

      expect(wrapper.find('.custom-action').text()).toBe('Custom slot content')
    })

    it('should support empty actions slot', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        },
        slots: {
          actions: ''
        }
      })

      const actionsDiv = wrapper.find('.header-actions')
      expect(actionsDiv.exists()).toBe(true)
      expect(actionsDiv.text()).toBe('')
    })
  })

  describe('layout structure', () => {
    it('should have correct DOM structure', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Test Title',
          subtitle: 'Test Subtitle'
        },
        slots: {
          actions: '<button>Test</button>'
        }
      })

      expect(wrapper.find('.page-header').exists()).toBe(true)
      expect(wrapper.find('.header-content').exists()).toBe(true)
      expect(wrapper.find('.header-text').exists()).toBe(true)
      expect(wrapper.find('.header-title').exists()).toBe(true)
      expect(wrapper.find('.header-subtitle').exists()).toBe(true)
      expect(wrapper.find('.header-actions').exists()).toBe(true)
    })

    it('should render header-text before header-actions', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Title'
        },
        slots: {
          actions: '<button>Action</button>'
        }
      })

      const content = wrapper.find('.header-content')
      const children = content.findAll('.header-text, .header-actions')
      expect(children.length).toBe(2)
      expect(children[0].classes()).toContain('header-text')
      expect(children[1].classes()).toContain('header-actions')
    })
  })

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title'
        }
      })

      const h1 = wrapper.find('h1')
      expect(h1.exists()).toBe(true)
      expect(h1.classes()).toContain('header-title')
    })

    it('should maintain semantic HTML structure', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Title',
          subtitle: 'Subtitle'
        }
      })

      const h1 = wrapper.find('.header-title')
      const p = wrapper.find('.header-subtitle')

      expect(h1.element.tagName).toBe('H1')
      expect(p.element.tagName).toBe('P')
    })
  })

  describe('prop combinations', () => {
    it('should handle title only', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Title Only'
        }
      })

      expect(wrapper.find('.header-title').text()).toBe('Title Only')
      expect(wrapper.find('.header-subtitle').exists()).toBe(false)
    })

    it('should handle title with subtitle', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Main Title',
          subtitle: 'Sub Title'
        }
      })

      expect(wrapper.find('.header-title').text()).toBe('Main Title')
      expect(wrapper.find('.header-subtitle').text()).toBe('Sub Title')
    })

    it('should handle title with actions', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Title'
        },
        slots: {
          actions: '<button>Action</button>'
        }
      })

      expect(wrapper.find('.header-title').exists()).toBe(true)
      expect(wrapper.find('.header-actions button').exists()).toBe(true)
    })

    it('should handle all props and slots', () => {
      const wrapper = mount(PageHeader, {
        props: {
          title: 'Full Title',
          subtitle: 'Full Subtitle'
        },
        slots: {
          actions: '<button>Full Action</button>'
        }
      })

      expect(wrapper.find('.header-title').text()).toBe('Full Title')
      expect(wrapper.find('.header-subtitle').text()).toBe('Full Subtitle')
      expect(wrapper.find('.header-actions button').exists()).toBe(true)
    })
  })
})
