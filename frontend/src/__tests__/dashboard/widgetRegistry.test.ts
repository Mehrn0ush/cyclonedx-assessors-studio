import { describe, it, expect } from 'vitest'
import { getAllWidgets, getWidgetDefinition, getWidgetsByCategory, getDefaultOverviewLayout, getDefaultProgressLayout } from '@/components/dashboard/widgetRegistry'

describe('widgetRegistry.ts', () => {
  describe('getAllWidgets', () => {
    it('should return all widgets', () => {
      const widgets = getAllWidgets()
      expect(Array.isArray(widgets)).toBe(true)
      expect(widgets.length).toBeGreaterThan(0)
    })

    it('should return widgets with required fields', () => {
      const widgets = getAllWidgets()

      widgets.forEach(widget => {
        expect(widget.type).toBeDefined()
        expect(widget.name).toBeDefined()
        expect(widget.description).toBeDefined()
        expect(widget.category).toBeDefined()
        expect(widget.component).toBeDefined()
      })
    })

    it('should include stat widgets', () => {
      const widgets = getAllWidgets()
      const statWidgets = widgets.filter(w => w.type.startsWith('stat-'))

      expect(statWidgets.length).toBeGreaterThan(0)
    })

    it('should include compliance widgets', () => {
      const widgets = getAllWidgets()
      const complianceWidgets = widgets.filter(w => w.category === 'compliance')

      expect(complianceWidgets.length).toBeGreaterThan(0)
    })

    it('should include overview widgets', () => {
      const widgets = getAllWidgets()
      const overviewWidgets = widgets.filter(w => w.category === 'overview')

      expect(overviewWidgets.length).toBeGreaterThan(0)
    })

    it('should include progress widgets', () => {
      const widgets = getAllWidgets()
      const progressWidgets = widgets.filter(w => w.category === 'progress')

      expect(progressWidgets.length).toBeGreaterThan(0)
    })

    it('should include risk widgets', () => {
      const widgets = getAllWidgets()
      const riskWidgets = widgets.filter(w => w.category === 'risk')

      expect(riskWidgets.length).toBeGreaterThan(0)
    })
  })

  describe('getWidgetDefinition', () => {
    it('should find widget by type', () => {
      const widget = getWidgetDefinition('stat-total-projects')
      expect(widget).toBeDefined()
      expect(widget?.type).toBe('stat-total-projects')
    })

    it('should return undefined for unknown type', () => {
      const widget = getWidgetDefinition('unknown-widget')
      expect(widget).toBeUndefined()
    })

    it('should return widget with all required fields', () => {
      const widget = getWidgetDefinition('stat-total-projects')

      expect(widget).toBeDefined()
      expect(widget?.type).toBeDefined()
      expect(widget?.name).toBeDefined()
      expect(widget?.description).toBeDefined()
      expect(widget?.category).toBeDefined()
      expect(widget?.component).toBeDefined()
    })

    it('should include dimension information', () => {
      const widget = getWidgetDefinition('stat-total-projects')

      expect(widget?.defaultW).toBeDefined()
      expect(widget?.defaultH).toBeDefined()
      expect(widget?.minW).toBeDefined()
      expect(widget?.minH).toBeDefined()
    })

    it('should have correct dimensions for stat widgets', () => {
      const widget = getWidgetDefinition('stat-total-projects')

      expect(widget?.defaultW).toBe(3)
      expect(widget?.defaultH).toBe(3)
      expect(widget?.minW).toBe(2)
      expect(widget?.minH).toBe(3)
    })

    it('should have correct dimensions for large widgets', () => {
      const widget = getWidgetDefinition('conformance-donut')

      expect(widget?.defaultW).toBe(6)
      expect(widget?.defaultH).toBe(6)
      expect(widget?.minW).toBe(4)
      expect(widget?.minH).toBe(5)
    })
  })

  describe('getWidgetsByCategory', () => {
    it('should group widgets by category', () => {
      const categories = getWidgetsByCategory()
      expect(Object.keys(categories).length).toBeGreaterThan(0)
    })

    it('should have overview category', () => {
      const categories = getWidgetsByCategory()
      expect(categories['overview']).toBeDefined()
      expect(categories['overview'].length).toBeGreaterThan(0)
    })

    it('should have compliance category', () => {
      const categories = getWidgetsByCategory()
      expect(categories['compliance']).toBeDefined()
      expect(categories['compliance'].length).toBeGreaterThan(0)
    })

    it('should have progress category', () => {
      const categories = getWidgetsByCategory()
      expect(categories['progress']).toBeDefined()
      expect(categories['progress'].length).toBeGreaterThan(0)
    })

    it('should have activity category', () => {
      const categories = getWidgetsByCategory()
      expect(categories['activity']).toBeDefined()
      expect(categories['activity'].length).toBeGreaterThan(0)
    })

    it('should have risk category', () => {
      const categories = getWidgetsByCategory()
      expect(categories['risk']).toBeDefined()
      expect(categories['risk'].length).toBeGreaterThan(0)
    })

    it('should include all widgets in categories', () => {
      const categories = getWidgetsByCategory()
      const allWidgets = getAllWidgets()
      const totalInCategories = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0)

      expect(totalInCategories).toBe(allWidgets.length)
    })
  })

  describe('getDefaultOverviewLayout', () => {
    it('should return default overview layout', () => {
      const layout = getDefaultOverviewLayout()
      expect(Array.isArray(layout)).toBe(true)
      expect(layout.length).toBeGreaterThan(0)
    })

    it('should have grid item objects with required fields', () => {
      const layout = getDefaultOverviewLayout()

      layout.forEach(item => {
        expect(item.i).toBeDefined()
        expect(item.x).toBeDefined()
        expect(item.y).toBeDefined()
        expect(item.w).toBeDefined()
        expect(item.h).toBeDefined()
        expect(item.widgetType).toBeDefined()
      })
    })

    it('should include stat widgets in overview', () => {
      const layout = getDefaultOverviewLayout()
      const statItems = layout.filter(item => item.widgetType.startsWith('stat-'))

      expect(statItems.length).toBeGreaterThan(0)
    })

    it('should include conformance and pipeline widgets', () => {
      const layout = getDefaultOverviewLayout()
      const types = layout.map(item => item.widgetType)

      expect(types).toContain('conformance-donut')
      expect(types).toContain('assessment-pipeline')
    })

    it('should have unique grid item identifiers', () => {
      const layout = getDefaultOverviewLayout()
      const ids = layout.map(item => item.i)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have valid grid positions', () => {
      const layout = getDefaultOverviewLayout()

      layout.forEach(item => {
        expect(item.x).toBeGreaterThanOrEqual(0)
        expect(item.y).toBeGreaterThanOrEqual(0)
        expect(item.w).toBeGreaterThan(0)
        expect(item.h).toBeGreaterThan(0)
      })
    })
  })

  describe('getDefaultProgressLayout', () => {
    it('should return default progress layout', () => {
      const layout = getDefaultProgressLayout()
      expect(Array.isArray(layout)).toBe(true)
      expect(layout.length).toBeGreaterThan(0)
    })

    it('should have grid item objects with required fields', () => {
      const layout = getDefaultProgressLayout()

      layout.forEach(item => {
        expect(item.i).toBeDefined()
        expect(item.x).toBeDefined()
        expect(item.y).toBeDefined()
        expect(item.w).toBeDefined()
        expect(item.h).toBeDefined()
        expect(item.widgetType).toBeDefined()
      })
    })

    it('should include stat widgets', () => {
      const layout = getDefaultProgressLayout()
      const statItems = layout.filter(item => item.widgetType.startsWith('stat-'))

      expect(statItems.length).toBeGreaterThan(0)
    })

    it('should include progress-specific widgets', () => {
      const layout = getDefaultProgressLayout()
      const types = layout.map(item => item.widgetType)

      expect(types).toContain('conformance-by-standard')
      expect(types).toContain('assessment-timeline')
    })

    it('should have unique grid item identifiers', () => {
      const layout = getDefaultProgressLayout()
      const ids = layout.map(item => item.i)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have valid grid positions', () => {
      const layout = getDefaultProgressLayout()

      layout.forEach(item => {
        expect(item.x).toBeGreaterThanOrEqual(0)
        expect(item.y).toBeGreaterThanOrEqual(0)
        expect(item.w).toBeGreaterThan(0)
        expect(item.h).toBeGreaterThan(0)
      })
    })
  })

  describe('widget properties', () => {
    it('should have icon property for all widgets', () => {
      const widgets = getAllWidgets()

      widgets.forEach(widget => {
        expect(widget.icon).toBeDefined()
        expect(typeof widget.icon).toBe('string')
      })
    })

    it('should have valid categories', () => {
      const widgets = getAllWidgets()
      const validCategories = ['overview', 'compliance', 'progress', 'activity', 'risk']

      widgets.forEach(widget => {
        expect(validCategories).toContain(widget.category)
      })
    })

    it('should have component loader function', () => {
      const widgets = getAllWidgets()

      widgets.forEach(widget => {
        expect(typeof widget.component).toBe('function')
      })
    })
  })
})
