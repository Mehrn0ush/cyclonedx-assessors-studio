import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listAssessors,
  getAssessor,
  createAssessor,
  updateAssessor,
  deleteAssessor,
} from '@/api/assessors'
import client from '@/api/client'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('assessors.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAssessors', () => {
    it('returns the data array from the envelope', async () => {
      // Backend serves these through /api/v1, which applies the
      // camelCaseResponse middleware, so the fixture mirrors the shape
      // the frontend actually receives rather than the raw DB columns.
      const rows = [
        {
          id: 'a1',
          bomRef: 'assessor/acme',
          thirdParty: true,
          entityId: 'e1',
          userId: null,
          entityName: 'Acme',
          entityType: 'Company',
          userDisplayName: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ]
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: rows } })

      const result = await listAssessors()

      expect(client.get).toHaveBeenCalledWith('/assessors')
      expect(result).toEqual(rows)
    })

    it('returns an empty array when data is missing', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
      const result = await listAssessors()
      expect(result).toEqual([])
    })
  })

  describe('getAssessor', () => {
    it('encodes the id segment', async () => {
      ;(client.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'a 1', bomRef: 'x', thirdParty: false, attestations: [] },
      })

      await getAssessor('a 1')

      expect(client.get).toHaveBeenCalledWith('/assessors/a%201')
    })
  })

  describe('createAssessor', () => {
    it('posts the payload and returns the created record', async () => {
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'a1', bomRef: 'assessor/new' },
      })

      const result = await createAssessor({ thirdParty: false, entityId: 'e1', userId: 'u1' })

      expect(client.post).toHaveBeenCalledWith('/assessors', {
        thirdParty: false,
        entityId: 'e1',
        userId: 'u1',
      })
      expect(result.id).toBe('a1')
    })

    it('allows null user and entity for a third-party reviewer with no mapping', async () => {
      ;(client.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'a2', bomRef: 'assessor/tp' },
      })

      await createAssessor({ thirdParty: true, entityId: null, userId: null })

      expect(client.post).toHaveBeenCalledWith('/assessors', {
        thirdParty: true,
        entityId: null,
        userId: null,
      })
    })
  })

  describe('updateAssessor', () => {
    it('PUTs to an encoded id with the partial payload', async () => {
      ;(client.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })

      await updateAssessor('a 1', { thirdParty: true, userId: null })

      expect(client.put).toHaveBeenCalledWith('/assessors/a%201', { thirdParty: true, userId: null })
    })
  })

  describe('deleteAssessor', () => {
    it('encodes the id segment', async () => {
      ;(client.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })

      await deleteAssessor('x/y')

      expect(client.delete).toHaveBeenCalledWith('/assessors/x%2Fy')
    })
  })
})
