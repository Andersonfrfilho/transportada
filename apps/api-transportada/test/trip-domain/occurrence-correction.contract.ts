/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveOccurrenceCorrectionChanged } from '../../src/trips/domain/occurrence-correction.policy.js'
import type { OccurrenceItemQuantity } from '../../src/trips/domain/occurrence-item-quantity.policy.js'

function item(
  code: string,
  quantity: null | string = null,
  unit: OccurrenceItemQuantity['unit'] = null,
): OccurrenceItemQuantity {
  return { code, quantity, unit }
}

describe('o que conta como mudança na correção (spec 167 RF5, CA03)', () => {
  test('mesmo conjunto, mesma ordem: não mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A'), item('B')],
        previousItems: [item('A'), item('B')],
      }),
    ).toBe(false)
  })

  test('mesmo conjunto, ordem diferente: não mudou — ordem não é mudança', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('B'), item('A')],
        previousItems: [item('A'), item('B')],
      }),
    ).toBe(false)
  })

  test('"1.0" e "1.000" são a mesma quantidade: não mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A', '1.000', 'unit')],
        previousItems: [item('A', '1.0', 'unit')],
      }),
    ).toBe(false)
  })

  test('"1.5" e "1.50" são a mesma quantidade: não mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A', '1.50', 'unit')],
        previousItems: [item('A', '1.5', 'unit')],
      }),
    ).toBe(false)
  })

  test('quantidade realmente diferente: mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A', '2', 'unit')],
        previousItems: [item('A', '1', 'unit')],
      }),
    ).toBe(true)
  })

  test('unidade diferente: mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A', '1', 'box')],
        previousItems: [item('A', '1', 'unit')],
      }),
    ).toBe(true)
  })

  test('item a mais: mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A'), item('B')],
        previousItems: [item('A')],
      }),
    ).toBe(true)
  })

  test('item a menos: mudou', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [item('A')],
        previousItems: [item('A'), item('B')],
      }),
    ).toBe(true)
  })

  test('lista vazia dos dois lados: não mudou (nota inteira continua nota inteira)', () => {
    expect(resolveOccurrenceCorrectionChanged({ nextItems: [], previousItems: [] })).toBe(false)
  })

  test('esvaziar a lista: mudou', () => {
    expect(resolveOccurrenceCorrectionChanged({ nextItems: [], previousItems: [item('A')] })).toBe(
      true,
    )
  })
})
