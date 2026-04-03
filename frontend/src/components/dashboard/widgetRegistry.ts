import type { Component } from 'vue'

export interface WidgetDefinition {
  type: string
  name: string
  description: string
  category: 'overview' | 'compliance' | 'progress' | 'activity' | 'risk'
  icon: string
  defaultW: number
  defaultH: number
  minW: number
  minH: number
  maxW?: number
  maxH?: number
  defaultConfig?: Record<string, any>
  component: () => Promise<Component>
}

const registry: WidgetDefinition[] = [
  // Individual stat card widgets (each independently movable/configurable)
  {
    type: 'stat-total-projects',
    name: 'Total Projects',
    description: 'Count of all projects.',
    category: 'overview',
    icon: 'FolderOpened',
    defaultW: 3,
    defaultH: 3,
    minW: 2,
    minH: 3,
    defaultConfig: { statKey: 'totalProjects' },
    component: () => import('./widgets/KpiStatsWidget.vue'),
  },
  {
    type: 'stat-total-assessments',
    name: 'Total Assessments',
    description: 'Count of all assessments.',
    category: 'overview',
    icon: 'DocumentChecked',
    defaultW: 3,
    defaultH: 3,
    minW: 2,
    minH: 3,
    defaultConfig: { statKey: 'totalAssessments' },
    component: () => import('./widgets/KpiStatsWidget.vue'),
  },
  {
    type: 'stat-completion-rate',
    name: 'Completion Rate',
    description: 'Percentage of assessments completed.',
    category: 'overview',
    icon: 'Odometer',
    defaultW: 3,
    defaultH: 3,
    minW: 2,
    minH: 3,
    defaultConfig: { statKey: 'completionRate' },
    component: () => import('./widgets/KpiStatsWidget.vue'),
  },
  {
    type: 'stat-overdue',
    name: 'Overdue Assessments',
    description: 'Count of assessments past their due date.',
    category: 'overview',
    icon: 'Warning',
    defaultW: 3,
    defaultH: 3,
    minW: 2,
    minH: 3,
    defaultConfig: { statKey: 'assessmentsOverdue' },
    component: () => import('./widgets/KpiStatsWidget.vue'),
  },
  {
    type: 'conformance-donut',
    name: 'Conformance Breakdown',
    description: 'Donut chart showing pass, fail, N/A, and unassessed requirement ratios.',
    category: 'compliance',
    icon: 'PieChart',
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 5,
    component: () => import('./widgets/ConformanceDonutWidget.vue'),
  },
  {
    type: 'assessment-pipeline',
    name: 'Assessment Pipeline',
    description: 'Bar chart of assessment states across the pipeline.',
    category: 'activity',
    icon: 'DataAnalysis',
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 5,
    component: () => import('./widgets/AssessmentPipelineWidget.vue'),
  },
  {
    type: 'risk-insights',
    name: 'Risk Insights',
    description: 'Blind spots, overdue items, unattested assessments, and expiring evidence.',
    category: 'risk',
    icon: 'Warning',
    defaultW: 12,
    defaultH: 5,
    minW: 6,
    minH: 4,
    component: () => import('./widgets/RiskInsightsWidget.vue'),
  },
  {
    type: 'compliance-coverage',
    name: 'Compliance Coverage',
    description: 'Per-standard progress bars showing requirement assessment coverage.',
    category: 'compliance',
    icon: 'Document',
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    component: () => import('./widgets/ComplianceCoverageWidget.vue'),
  },
  {
    type: 'project-health',
    name: 'Project Health',
    description: 'Per-project overview with completion rate and overdue counts.',
    category: 'overview',
    icon: 'FolderOpened',
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    component: () => import('./widgets/ProjectHealthWidget.vue'),
  },
  {
    type: 'recent-assessments',
    name: 'Recent Assessments',
    description: 'Table of the most recently created assessments.',
    category: 'activity',
    icon: 'DocumentChecked',
    defaultW: 12,
    defaultH: 5,
    minW: 6,
    minH: 4,
    component: () => import('./widgets/RecentAssessmentsWidget.vue'),
  },
  {
    type: 'evidence-health',
    name: 'Evidence Health',
    description: 'Evidence status breakdown and upcoming expirations.',
    category: 'compliance',
    icon: 'Collection',
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
    component: () => import('./widgets/EvidenceHealthWidget.vue'),
  },
  {
    type: 'upcoming-due-dates',
    name: 'Upcoming Due Dates',
    description: 'Timeline of assessments approaching their due dates.',
    category: 'activity',
    icon: 'Calendar',
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
    component: () => import('./widgets/UpcomingDueDatesWidget.vue'),
  },
  {
    type: 'conformance-by-standard',
    name: 'Conformance by Standard',
    description: 'Conformance scores per standard from completed assessments.',
    category: 'progress',
    icon: 'TrendCharts',
    defaultW: 12,
    defaultH: 6,
    minW: 6,
    minH: 4,
    component: () => import('./widgets/ConformanceByStandardWidget.vue'),
  },
  {
    type: 'assessment-timeline',
    name: 'Assessment Timeline',
    description: 'Table of completed assessments with conformance scores.',
    category: 'progress',
    icon: 'Timer',
    defaultW: 12,
    defaultH: 6,
    minW: 6,
    minH: 4,
    component: () => import('./widgets/AssessmentTimelineWidget.vue'),
  },
]

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return registry.find(w => w.type === type)
}

export function getWidgetsByCategory(): Record<string, WidgetDefinition[]> {
  const categories: Record<string, WidgetDefinition[]> = {}
  for (const widget of registry) {
    if (!categories[widget.category]) categories[widget.category] = []
    categories[widget.category].push(widget)
  }
  return categories
}

export function getAllWidgets(): WidgetDefinition[] {
  return [...registry]
}

/** Build a default "Overview" dashboard layout */
export function getDefaultOverviewLayout() {
  return [
    { i: 'stat-proj', x: 0, y: 0, w: 3, h: 3, widgetType: 'stat-total-projects', config: { statKey: 'totalProjects' } },
    { i: 'stat-asmt', x: 3, y: 0, w: 3, h: 3, widgetType: 'stat-total-assessments', config: { statKey: 'totalAssessments' } },
    { i: 'stat-rate', x: 6, y: 0, w: 3, h: 3, widgetType: 'stat-completion-rate', config: { statKey: 'completionRate' } },
    { i: 'stat-over', x: 9, y: 0, w: 3, h: 3, widgetType: 'stat-overdue', config: { statKey: 'assessmentsOverdue' } },
    { i: 'conf-1', x: 0, y: 3, w: 6, h: 6, widgetType: 'conformance-donut', config: {} },
    { i: 'pipe-1', x: 6, y: 3, w: 6, h: 6, widgetType: 'assessment-pipeline', config: {} },
    { i: 'risk-1', x: 0, y: 9, w: 12, h: 5, widgetType: 'risk-insights', config: {} },
    { i: 'cov-1', x: 0, y: 14, w: 6, h: 6, widgetType: 'compliance-coverage', config: {} },
    { i: 'ph-1', x: 6, y: 14, w: 6, h: 6, widgetType: 'project-health', config: {} },
    { i: 'ra-1', x: 0, y: 20, w: 12, h: 5, widgetType: 'recent-assessments', config: {} },
    { i: 'eh-1', x: 0, y: 25, w: 6, h: 5, widgetType: 'evidence-health', config: {} },
    { i: 'dd-1', x: 6, y: 25, w: 6, h: 5, widgetType: 'upcoming-due-dates', config: {} },
  ]
}

/** Build a default "Progress" dashboard layout */
export function getDefaultProgressLayout() {
  return [
    { i: 'stat-proj', x: 0, y: 0, w: 3, h: 3, widgetType: 'stat-total-projects', config: { statKey: 'totalProjects' } },
    { i: 'stat-asmt', x: 3, y: 0, w: 3, h: 3, widgetType: 'stat-total-assessments', config: { statKey: 'totalAssessments' } },
    { i: 'stat-rate', x: 6, y: 0, w: 3, h: 3, widgetType: 'stat-completion-rate', config: { statKey: 'completionRate' } },
    { i: 'stat-over', x: 9, y: 0, w: 3, h: 3, widgetType: 'stat-overdue', config: { statKey: 'assessmentsOverdue' } },
    { i: 'cbs-1', x: 0, y: 3, w: 12, h: 6, widgetType: 'conformance-by-standard', config: {} },
    { i: 'at-1', x: 0, y: 9, w: 12, h: 6, widgetType: 'assessment-timeline', config: {} },
  ]
}
