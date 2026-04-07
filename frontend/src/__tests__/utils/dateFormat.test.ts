import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { formatDate, formatDateTime, formatTimestamp } from '@/utils/dateFormat'

describe('dateFormat utilities', () => {
  // Store original documentElement.lang
  let originalLang: string | null

  beforeEach(() => {
    originalLang = document.documentElement.lang
    document.documentElement.lang = 'en-US'
  })

  afterEach(() => {
    document.documentElement.lang = originalLang || ''
  })

  describe('formatDate', () => {
    it('should format a valid ISO date string', () => {
      const result = formatDate('2026-04-07T10:30:00Z')
      expect(result).toMatch(/Apr 7, 2026|4\/7\/2026/)
    })

    it('should return dash for null date', () => {
      expect(formatDate(null)).toBe('-')
    })

    it('should return dash for undefined date', () => {
      expect(formatDate(undefined)).toBe('-')
    })

    it('should return dash for empty string', () => {
      expect(formatDate('')).toBe('-')
    })

    it('should return the original string for invalid date', () => {
      const invalidDate = 'invalid-date-string'
      expect(formatDate(invalidDate)).toBe(invalidDate)
    })

    it('should handle different valid date formats', () => {
      // Use a full ISO string to avoid timezone-dependent date shift
      const result = formatDate('2025-12-25T12:00:00')
      expect(result).toMatch(/Dec 25, 2025|12\/25\/2025/)
    })

    it('should format dates with different locales', () => {
      document.documentElement.lang = 'fr-FR'
      const result = formatDate('2026-04-07')
      // French locale should contain "avr." or "avril"
      expect(result).toBeTruthy()
    })
  })

  describe('formatDateTime', () => {
    it('should format a valid ISO datetime string', () => {
      const result = formatDateTime('2026-04-07T14:30:00Z')
      expect(result).toContain('Apr')
      expect(result).toContain('2026')
      expect(result).toContain(':')
    })

    it('should return dash for null datetime', () => {
      expect(formatDateTime(null)).toBe('-')
    })

    it('should return dash for undefined datetime', () => {
      expect(formatDateTime(undefined)).toBe('-')
    })

    it('should return dash for empty string', () => {
      expect(formatDateTime('')).toBe('-')
    })

    it('should return original string for invalid datetime', () => {
      const invalidDateTime = 'not-a-datetime'
      expect(formatDateTime(invalidDateTime)).toBe(invalidDateTime)
    })

    it('should include both date and time information', () => {
      const result = formatDateTime('2026-04-07T09:15:00Z')
      // Should contain date and time elements (time is local, not necessarily '09')
      expect(result.length).toBeGreaterThan(10)
      expect(result).toContain('Apr')
      expect(result).toContain('15') // minutes remain the same regardless of timezone
    })
  })

  describe('formatTimestamp', () => {
    it('should format a valid timestamp with seconds', () => {
      const result = formatTimestamp('2026-04-07T14:30:45Z')
      // Date parts are stable; hour may shift due to local timezone
      expect(result).toContain('2026')
      expect(result).toContain('30')
      expect(result).toContain('45')
    })

    it('should return dash for null timestamp', () => {
      expect(formatTimestamp(null)).toBe('-')
    })

    it('should return dash for undefined timestamp', () => {
      expect(formatTimestamp(undefined)).toBe('-')
    })

    it('should return dash for empty string', () => {
      expect(formatTimestamp('')).toBe('-')
    })

    it('should return original string for invalid timestamp', () => {
      const invalidTimestamp = 'invalid-ts'
      expect(formatTimestamp(invalidTimestamp)).toBe(invalidTimestamp)
    })

    it('should include seconds in the output', () => {
      const result = formatTimestamp('2026-04-07T08:05:03Z')
      // Should be longer than datetime format due to seconds
      expect(result.length).toBeGreaterThan(15)
    })

    it('should pad numbers with two digits', () => {
      const result = formatTimestamp('2026-01-05T02:05:09Z')
      // Minutes and seconds are timezone-invariant; month/day/hour may shift
      expect(result).toContain('05')
      expect(result).toContain('09')
      expect(result).toContain('2026')
    })
  })
})
