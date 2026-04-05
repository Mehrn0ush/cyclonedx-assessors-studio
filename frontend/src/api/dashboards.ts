import client from './client'

export interface WidgetLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  widgetType: string
  config?: Record<string, any>
}

export interface DashboardConfig {
  id: string
  name: string
  description?: string | null
  ownerId: string
  isDefault: boolean
  isShared: boolean
  layout: WidgetLayoutItem[]
  createdAt: string
  updatedAt: string
}

export async function getDashboardConfigs(): Promise<DashboardConfig[]> {
  const { data } = await client.get('/dashboard/configs')
  return data.data
}

export async function getDashboardConfig(id: string): Promise<DashboardConfig> {
  const { data } = await client.get(`/dashboard/configs/${id}`)
  return data
}

export async function createDashboardConfig(config: {
  name: string
  description?: string | null
  isShared?: boolean
  layout: WidgetLayoutItem[]
}): Promise<DashboardConfig> {
  const { data } = await client.post('/dashboard/configs', config)
  return data
}

export async function updateDashboardConfig(
  id: string,
  updates: {
    name?: string
    description?: string | null
    isShared?: boolean
    isDefault?: boolean
    layout?: WidgetLayoutItem[]
  }
): Promise<DashboardConfig> {
  const { data } = await client.put(`/dashboard/configs/${id}`, updates)
  return data
}

export async function deleteDashboardConfig(id: string): Promise<void> {
  await client.delete(`/dashboard/configs/${id}`)
}
