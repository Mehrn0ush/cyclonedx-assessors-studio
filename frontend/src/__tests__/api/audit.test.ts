import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listAuditLogs, listEntityAuditLogs, getAuditOptions } from '@/api/audit'
import client from '@/api/client'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('audit.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAuditLogs', () => {
    it('returns the page envelope as-is', async () => {
      const page = {
        data: [
          {
            id: 'a1',
            entity_type: 'user',
            entity_id: 'u1',
            action: 'user.create',
            user_id: 'admin',
            changes: null,
            ip_address: '127.0.0.1',
            user_agent: 'jest',
            request_id: 'r1',
            created_at: '2026-04-01T00:00:00Z',
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: page })

      const result = await listAuditLogs({ limit: 50, offset: 0 })

      expect(client.get).toHaveBeenCalledWith('/audit', { params: { limit: 50, offset: 0 } })
      expect(result).toEqual(page)
    })

    it('passes all filter parameters through', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: { limit: 10, offset: 0, total: 0 } },
      })

      await listAuditLogs({
        limit: 10,
        offset: 0,
        entityType: 'user',
        entityId: 'u1',
        userId: 'admin',
        action: 'user.delete',
        from: '2026-01-01',
        to: '2026-04-01',
      })

      expect(client.get).toHaveBeenCalledWith('/audit', {
        params: {
          limit: 10,
          offset: 0,
          entityType: 'user',
          entityId: 'u1',
          userId: 'admin',
          action: 'user.delete',
          from: '2026-01-01',
          to: '2026-04-01',
        },
      })
    })
  })

  describe('getAuditOptions', () => {
    it('returns the options envelope from the server', async () => {
      const options = {
        entityTypes: ['project', 'assessment', 'evidence'],
        actions: ['create', 'update', 'delete'],
      }
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: options })

      const result = await getAuditOptions()

      expect(client.get).toHaveBeenCalledWith('/audit/options')
      expect(result).toEqual(options)
    })
  })

  describe('listEntityAuditLogs', () => {
    it('URI-encodes the entity path segments', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: { limit: 25, offset: 0, total: 0 } },
      })

      await listEntityAuditLogs('entity type', 'id/with/slashes', { limit: 25 })

      expect(client.get).toHaveBeenCalledWith(
        '/audit/entity/entity%20type/id%2Fwith%2Fslashes',
        { params: { limit: 25 } },
      )
    })
  })
})
