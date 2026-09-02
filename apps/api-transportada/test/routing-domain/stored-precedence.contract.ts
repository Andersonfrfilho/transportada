/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { shouldReplaceStored } from '../../src/routing/domain/geocoding-precision.policy.js'

describe('stored coordinate precedence (ADR-0044 §3)', () => {
  /**
   * A correção manual é o trabalho que o produto pede ao humano em troca de não pedir de novo.
   * Nenhuma geocodificação posterior a desfaz — ou o pino arrastado voltaria sozinho.
   */
  test('never lets a provider overwrite a coordinate a human corrected', () => {
    expect(
      shouldReplaceStored({
        candidatePrecision: 'rooftop',
        candidateSource: 'google',
        storedPrecision: 'city',
        storedSource: 'manual',
      }),
    ).toBe(false)
  })

  test('lets a human correction win over anything the provider stored', () => {
    expect(
      shouldReplaceStored({
        candidatePrecision: 'city',
        candidateSource: 'manual',
        storedPrecision: 'rooftop',
        storedSource: 'google',
      }),
    ).toBe(true)
  })

  /** Regeocodificar um telhado para um centroide seria piorar o cadastro com uma escrita. */
  test('refuses to replace a finer coordinate with a coarser one', () => {
    expect(
      shouldReplaceStored({
        candidatePrecision: 'city',
        candidateSource: 'google',
        storedPrecision: 'rooftop',
        storedSource: 'google',
      }),
    ).toBe(false)
  })

  test('accepts a finer coordinate over a coarser one', () => {
    expect(
      shouldReplaceStored({
        candidatePrecision: 'rooftop',
        candidateSource: 'google',
        storedPrecision: 'postal_code',
        storedSource: 'postal_code',
      }),
    ).toBe(true)
  })
})
