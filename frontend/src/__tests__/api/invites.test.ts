import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listInvites, createInvite, revokeInvite } from '@/api/invites'
import client from '@/api/client'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('invites.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listInvites', () => {
    it('returns the invites array from the response envelope', async () => {
      const invites = [
        {
          id: 'i1',
          email: 'newuser@example.com',
          intendedRole: 'assessor',
          createdBy: 'admin',
          createdAt: '2026-04-01T00:00:00Z',
          expiresAt: '2026-04-08T00:00:00Z',
          consumedAt: null,
          consumedBy: null,
          revokedAt: null,
          status: 'pending',
        },
      ]
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { invites } })

      const result = await listInvites()

      expect(client.get).toHaveBeenCalledWith('/admin/invites')
      expect(result).toEqual(invites)
    })

    it('returns an empty array when invites is missing', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
      const result = await listInvites()
      expect(result).toEqual([])
    })
  })

  describe('createInvite', () => {
    it('returns the plaintext token from the response (one time secret)', async () => {
      const created = {
        id: 'i1',
        token: 'inv_abcdef0123456789abcdef0123456789',
        email: 'newuser@example.com',
        intendedRole: 'assessor',
        expiresAt: '2026-04-08T00:00:00Z',
      }
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created })

      const result = await createInvite({
        email: 'newuser@example.com',
        intendedRole: 'assessor',
        expiresInHours: 168,
      })

      expect(client.post).toHaveBeenCalledWith('/admin/invites', {
        email: 'newuser@example.com',
        intendedRole: 'assessor',
        expiresInHours: 168,
      })
      expect(result.token).toBe(created.token)
    })
  })

  describe('revokeInvite', () => {
    it('encodes the id segment to defeat path traversal', async () => {
      ;(client.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })

      await revokeInvite('odd/id')

      expect(client.delete).toHaveBeenCalledWith('/admin/invites/odd%2Fid')
    })
  })
})
