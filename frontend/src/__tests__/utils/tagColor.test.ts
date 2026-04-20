import { describe, it, expect } from 'vitest'
import { hexToRgba, isValidHexColor, tagPillStyle } from '@/utils/tagColor'

describe('tagColor utilities', () => {
  describe('isValidHexColor', () => {
    it('accepts a 6-digit hex string', () => {
      expect(isValidHexColor('#ff0000')).toBe(true)
      expect(isValidHexColor('#AbC123')).toBe(true)
    })

    it('rejects 3-digit, empty, or malformed values', () => {
      expect(isValidHexColor('#fff')).toBe(false)
      expect(isValidHexColor('')).toBe(false)
      expect(isValidHexColor(undefined)).toBe(false)
      expect(isValidHexColor(null)).toBe(false)
      expect(isValidHexColor('red')).toBe(false)
      expect(isValidHexColor('#ff00zz')).toBe(false)
    })
  })

  describe('hexToRgba', () => {
    it('converts a valid hex at the supplied alpha', () => {
      expect(hexToRgba('#ff0000', 0.1)).toBe('rgba(255, 0, 0, 0.1)')
      expect(hexToRgba('#00ff00', 0.4)).toBe('rgba(0, 255, 0, 0.4)')
    })

    it('falls back to the CycloneDX green for invalid input', () => {
      // The fallback keeps pills from rendering as bare text when
      // upstream data drifts (eg a missing color after a partial
      // migration or a malformed user input).
      expect(hexToRgba(undefined, 0.1)).toBe('rgba(63, 185, 80, 0.1)')
      expect(hexToRgba('not-a-hex', 0.4)).toBe('rgba(63, 185, 80, 0.4)')
    })
  })

  describe('tagPillStyle', () => {
    it('returns the three inline values a pill needs', () => {
      const style = tagPillStyle('#3b82f6')
      expect(style).toEqual({
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.4)',
        color: '#3b82f6',
      })
    })

    it('uses the fallback hex for the text colour when input is invalid', () => {
      const style = tagPillStyle('')
      expect(style.color).toBe('#3fb950')
      expect(style.backgroundColor).toBe('rgba(63, 185, 80, 0.1)')
      expect(style.borderColor).toBe('rgba(63, 185, 80, 0.4)')
    })
  })
})
