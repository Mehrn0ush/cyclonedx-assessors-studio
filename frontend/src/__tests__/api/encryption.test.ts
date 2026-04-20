import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEncryptionStatus, rotateEncryptionKey } from '@/api/encryption'
import client from '@/api/client'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('encryption.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEncryptionStatus', () => {
    it('fetches status from the admin endpoint', async () => {
      const status = {
        available: true,
        passthroughMode: false,
        activeKeyVersion: 2,
        keyVersions: [
          { version: 2, isActive: true, createdAt: '2026-04-01T00:00:00Z', retiredAt: null },
          { version: 1, isActive: false, createdAt: '2026-01-01T00:00:00Z', retiredAt: '2026-04-01T00:00:00Z' },
        ],
        encryptedFields: { webhook: { total: 5, encrypted: 5, plaintext: 0 } },
      }
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: status })

      const result = await getEncryptionStatus()

      expect(client.get).toHaveBeenCalledWith('/admin/encryption/status')
      expect(result).toEqual(status)
    })
  })

  describe('rotateEncryptionKey', () => {
    it('posts to the rotate endpoint and returns the counts', async () => {
      const payload = {
        message: 'rotated',
        previousVersion: 1,
        newVersion: 2,
        processed: 10,
        rekeyed: 10,
      }
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: payload })

      const result = await rotateEncryptionKey()

      expect(client.post).toHaveBeenCalledWith('/admin/encryption/rotate')
      expect(result).toEqual(payload)
    })
  })
})
