import { describe, it, expect } from 'vitest'
import { snakeToCamel, keysToCamel } from '@/utils/caseTransform'

describe('caseTransform utilities', () => {
  describe('snakeToCamel', () => {
    it('should convert simple snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld')
    })

    it('should convert multiple underscores', () => {
      expect(snakeToCamel('hello_world_test')).toBe('helloWorldTest')
    })

    it('should handle single word strings', () => {
      expect(snakeToCamel('hello')).toBe('hello')
    })

    it('should handle empty strings', () => {
      expect(snakeToCamel('')).toBe('')
    })

    it('should handle strings with leading underscore', () => {
      expect(snakeToCamel('_private')).toBe('Private')
    })

    it('should handle strings with consecutive underscores', () => {
      // Regex /_([a-z])/g only matches _ followed by a letter;
      // the first _ in __ is followed by _, so it stays
      expect(snakeToCamel('hello__world')).toBe('hello_World')
    })

    it('should preserve existing camelCase', () => {
      expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel')
    })

    it('should handle mixed cases correctly', () => {
      expect(snakeToCamel('first_name_last_name')).toBe('firstNameLastName')
    })
  })

  describe('keysToCamel', () => {
    it('should convert object keys from snake_case to camelCase', () => {
      const input = {
        user_name: 'john',
        user_email: 'john@example.com'
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        userName: 'john',
        userEmail: 'john@example.com'
      })
    })

    it('should recursively convert nested objects', () => {
      const input = {
        user_info: {
          first_name: 'John',
          last_name: 'Doe'
        }
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        userInfo: {
          firstName: 'John',
          lastName: 'Doe'
        }
      })
    })

    it('should handle arrays of objects', () => {
      const input = [
        { user_name: 'john' },
        { user_name: 'jane' }
      ]
      const result = keysToCamel(input)
      expect(result).toEqual([
        { userName: 'john' },
        { userName: 'jane' }
      ])
    })

    it('should handle deeply nested structures', () => {
      const input = {
        project_data: {
          team_members: [
            {
              user_info: {
                first_name: 'Alice',
                last_name: 'Smith'
              }
            }
          ]
        }
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        projectData: {
          teamMembers: [
            {
              userInfo: {
                firstName: 'Alice',
                lastName: 'Smith'
              }
            }
          ]
        }
      })
    })

    it('should return primitive values unchanged', () => {
      expect(keysToCamel('string')).toBe('string')
      expect(keysToCamel(123)).toBe(123)
      expect(keysToCamel(true)).toBe(true)
    })

    it('should handle null values', () => {
      const input = {
        user_name: 'john',
        user_address: null
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        userName: 'john',
        userAddress: null
      })
    })

    it('should preserve Date objects', () => {
      const date = new Date('2026-04-07')
      const input = {
        created_at: date,
        user_name: 'john'
      }
      const result = keysToCamel(input)
      expect(result.createdAt).toBe(date)
      expect(result.userName).toBe('john')
    })

    it('should handle empty objects', () => {
      expect(keysToCamel({})).toEqual({})
    })

    it('should handle empty arrays', () => {
      expect(keysToCamel([])).toEqual([])
    })

    it('should handle mixed arrays with primitives and objects', () => {
      const input = {
        items_list: [
          { item_name: 'apple' },
          'string_item',
          42
        ]
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        itemsList: [
          { itemName: 'apple' },
          'string_item',
          42
        ]
      })
    })

    it('should handle objects with numeric string values', () => {
      const input = {
        user_id: '12345',
        user_count: '100'
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        userId: '12345',
        userCount: '100'
      })
    })

    it('should handle objects with multiple levels of empty objects', () => {
      const input = {
        level_one: {
          level_two: {
            level_three: {}
          }
        }
      }
      const result = keysToCamel(input)
      expect(result).toEqual({
        levelOne: {
          levelTwo: {
            levelThree: {}
          }
        }
      })
    })
  })
})
