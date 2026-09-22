/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF02 — a caixa estimada a partir da unidade (CA01, CA02).
 */
import { describe, expect, test } from 'bun:test'

import { estimatePackageBoxFromUnit } from '../../src/nfe-documents/domain/package-box-estimate.policy.js'

const LUX_UNIT = { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 } as const

function expectWithinOnePercent(actual: number, expected: number): void {
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(0.01)
}

describe('estimatePackageBoxFromUnit (spec 163, RF02)', () => {
  test('CA01: Lux 60×90×30 mm, 24 un., 85 g → 188×188×128 mm, 2x2x6, ~4 524 cm³, ~2 142 g', () => {
    const estimate = estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 24 })

    expect(estimate).toBeDefined()
    const edges = [estimate?.lengthMm, estimate?.widthMm, estimate?.heightMm]
    expect(edges).toEqual([188, 188, 128])
    expect(estimate?.arrangement).toBe('2x2x6')
    expectWithinOnePercent(estimate?.volumeCm3 ?? 0, 4524)
    expectWithinOnePercent(estimate?.grossWeightGrams ?? 0, 2142)
  })

  test('é determinística: a mesma entrada devolve o mesmo resultado', () => {
    const first = estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 24 })
    const second = estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 24 })
    expect(second).toEqual(first)
  })

  test('volume e peso saem inteiros (RNF03)', () => {
    const estimate = estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 24 })
    expect(Number.isInteger(estimate?.volumeCm3)).toBe(true)
    expect(Number.isInteger(estimate?.grossWeightGrams)).toBe(true)
  })

  test('n primo cai em 1×1×n', () => {
    const estimate = estimatePackageBoxFromUnit({
      unit: { grossWeightGrams: 100, heightMm: 50, lengthMm: 50, widthMm: 50 },
      unitsPerBox: 7,
    })
    expect(estimate?.arrangement).toBe('1x1x7')
  })

  test('sem peso da unidade, a caixa sai sem peso estimado', () => {
    const estimate = estimatePackageBoxFromUnit({
      unit: { heightMm: 30, lengthMm: 60, widthMm: 90 },
      unitsPerBox: 24,
    })
    expect(estimate?.lengthMm).toBe(188)
    expect(estimate?.grossWeightGrams).toBeUndefined()
  })

  test('CA02: units_per_box = 1 → sem estimativa', () => {
    expect(estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 1 })).toBeUndefined()
  })

  test('CA02: units_per_box ausente ou zero → sem estimativa', () => {
    expect(estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: undefined })).toBeUndefined()
    expect(estimatePackageBoxFromUnit({ unit: LUX_UNIT, unitsPerBox: 0 })).toBeUndefined()
  })

  test('CA02: unidade incompleta (falta aresta) → sem estimativa', () => {
    expect(
      estimatePackageBoxFromUnit({
        unit: { grossWeightGrams: 85, heightMm: undefined, lengthMm: 60, widthMm: 90 },
        unitsPerBox: 24,
      }),
    ).toBeUndefined()
  })
})
