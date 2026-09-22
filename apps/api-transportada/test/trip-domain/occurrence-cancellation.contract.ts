/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveOccurrenceCancellationReason } from '../../src/trips/domain/occurrence-cancellation.policy.js'
import {
  OccurrenceCancellationReasonRequiredError,
  OccurrenceCancellationReasonTooLongError,
} from '../../src/trips/domain/trip.error.js'

describe('motivo do cancelamento (spec 167 RF6, CA07)', () => {
  test('recorta espaço nas pontas', () => {
    expect(resolveOccurrenceCancellationReason('  caixa marcada por engano  ')).toBe(
      'caixa marcada por engano',
    )
  })

  test('vazio é recusado', () => {
    expect(() => resolveOccurrenceCancellationReason('')).toThrow(
      OccurrenceCancellationReasonRequiredError,
    )
  })

  test('só espaço é recusado', () => {
    expect(() => resolveOccurrenceCancellationReason('   ')).toThrow(
      OccurrenceCancellationReasonRequiredError,
    )
  })

  test('exatamente 500 caracteres é aceito', () => {
    const reason = 'a'.repeat(500)
    expect(resolveOccurrenceCancellationReason(reason)).toBe(reason)
  })

  test('501 caracteres é recusado', () => {
    expect(() => resolveOccurrenceCancellationReason('a'.repeat(501))).toThrow(
      OccurrenceCancellationReasonTooLongError,
    )
  })
})
