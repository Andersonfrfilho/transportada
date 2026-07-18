import { describe, expect, it } from 'vitest'
import { normalizeCorrelationId } from '../src/index.js'

describe('normalizeCorrelationId', () => {
  it('preserves a valid caller correlation id', () => {
    expect(normalizeCorrelationId('batch:abc-123')).toBe('batch:abc-123')
  })

  it('removes log-injection characters', () => {
    expect(normalizeCorrelationId('safe\nforged')).toBe('safeforged')
  })

  it('generates a UUID for invalid input', () => {
    expect(normalizeCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/)
  })
})
