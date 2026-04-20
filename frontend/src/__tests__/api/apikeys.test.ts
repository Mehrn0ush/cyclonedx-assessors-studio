import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listApiKeys, createApiKey, revokeApiKey } from '@/api/apikeys'
import client from '@/api/client'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('apikeys.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listApiKeys', () => {
    it('returns the data array from the wrapped envelope', async () => {
      const rows = [
        {
          id: 'k1',
          name: 'CI runner',
          prefix: 'cdxa_abc',
          user_id: 'u1',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: rows } })

      const result = await listApiKeys()

      expect(client.get).toHaveBeenCalledWith('/apikeys')
      expect(result).toEqual(rows)
    })

    it('returns an empty array if the server omits the data field', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
      const result = await listApiKeys()
      expect(result).toEqual([])
    })
  })

  describe('createApiKey', () => {
    it('posts the payload and returns the plaintext key once', async () => {
      const created = {
        id: 'k1',
        name: 'CI runner',
        prefix: 'cdxa_abc',
        key: 'cdxa_0123456789abcdef0123456789abcdef0123456789',
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      }
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created })

      const result = await createApiKey({ name: 'CI runner', expiresInDays: 90 })

      expect(client.post).toHaveBeenCalledWith('/apikeys', {
        name: 'CI runner',
        expiresInDays: 90,
      })
      expect(result).toEqual(created)
    })

    it('forwards an admin-only userId override', async () => {
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'k2', name: 'Tester key', prefix: 'cdxa_xyz', key: 'cdxa_test', expiresAt: null, createdAt: 'now' },
      })

      await createApiKey({ name: 'Tester key', userId: 'u-target' })

      expect(client.post).toHaveBeenCalledWith('/apikeys', {
        name: 'Tester key',
        userId: 'u-target',
      })
    })
  })

  describe('revokeApiKey', () => {
    it('encodes the id segment so a malicious id cannot inject path components', async () => {
      ;(client.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })

      await revokeApiKey('weird/id with space')

      expect(client.delete).toHaveBeenCalledWith('/apikeys/weird%2Fid%20with%20space')
    })
  })
})
