/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF03 e P4 — sanidade da unidade (CA03) e a unidade conferindo a caixa (CA04).
 */
import { describe, expect, test } from 'bun:test'

import {
  evaluatePackageBoxAgainstUnit,
  evaluatePackageBoxUnitSanity,
  UNIT_EDGE_MAX_MM,
  UNIT_EDGE_MIN_MM,
} from '../../src/nfe-documents/domain/package-box-unit-sanity.policy.js'

const LUX_UNIT = { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 } as const

describe('evaluatePackageBoxUnitSanity (spec 163, RF03)', () => {
  test('unidade plausível é aceita', () => {
    expect(evaluatePackageBoxUnitSanity(LUX_UNIT)).toEqual({ accepted: true })
  })

  test('faixa da aresta da unidade é 5–1500 mm', () => {
    expect(UNIT_EDGE_MIN_MM).toBe(5)
    expect(UNIT_EDGE_MAX_MM).toBe(1500)
    expect(evaluatePackageBoxUnitSanity({ ...LUX_UNIT, heightMm: 5 }).accepted).toBe(true)
    expect(evaluatePackageBoxUnitSanity({ ...LUX_UNIT, lengthMm: 1500 }).accepted).toBe(true)
  })

  test('CA03: "2160 mm" num frasco → UNIT_EDGE_OUT_OF_RANGE, nunca corrigido', () => {
    const result = evaluatePackageBoxUnitSanity({ ...LUX_UNIT, heightMm: 2160 })
    expect(result).toEqual({ accepted: false, reasons: ['UNIT_EDGE_OUT_OF_RANGE'] })
  })

  test('aresta abaixo de 5 mm → UNIT_EDGE_OUT_OF_RANGE', () => {
    const result = evaluatePackageBoxUnitSanity({ ...LUX_UNIT, widthMm: 4 })
    expect(result).toEqual({ accepted: false, reasons: ['UNIT_EDGE_OUT_OF_RANGE'] })
  })

  test('aresta não inteira → UNIT_EDGE_OUT_OF_RANGE (RNF03: inteiros em mm)', () => {
    const result = evaluatePackageBoxUnitSanity({ ...LUX_UNIT, widthMm: 90.5 })
    expect(result).toEqual({ accepted: false, reasons: ['UNIT_EDGE_OUT_OF_RANGE'] })
  })

  test('peso não positivo → UNIT_WEIGHT_NOT_POSITIVE', () => {
    const result = evaluatePackageBoxUnitSanity({ ...LUX_UNIT, grossWeightGrams: 0 })
    expect(result).toEqual({ accepted: false, reasons: ['UNIT_WEIGHT_NOT_POSITIVE'] })
  })

  test('peso é opcional', () => {
    expect(evaluatePackageBoxUnitSanity({ heightMm: 30, lengthMm: 60, widthMm: 90 }).accepted).toBe(
      true,
    )
  })
})

describe('evaluatePackageBoxAgainstUnit (spec 163, P4)', () => {
  const box = { grossWeightGrams: 2200, heightMm: 128, lengthMm: 188, widthMm: 188 } as const

  test('caixa coerente com 24 unidades é aceita', () => {
    expect(evaluatePackageBoxAgainstUnit({ box, unit: LUX_UNIT, unitsPerBox: 24 })).toEqual({
      accepted: true,
    })
  })

  test('CA04: volume da caixa menor que o conteúdo → VOLUME_BELOW_CONTENT (código da 160)', () => {
    const result = evaluatePackageBoxAgainstUnit({
      box: { ...box, heightMm: 60 },
      unit: LUX_UNIT,
      unitsPerBox: 24,
    })
    expect(result).toEqual({ accepted: false, reasons: ['VOLUME_BELOW_CONTENT'] })
  })

  test('peso bruto menor que o conteúdo → GROSS_WEIGHT_BELOW_CONTENT (código da 160)', () => {
    const result = evaluatePackageBoxAgainstUnit({
      box: { ...box, grossWeightGrams: 2000 },
      unit: LUX_UNIT,
      unitsPerBox: 24,
    })
    expect(result).toEqual({ accepted: false, reasons: ['GROSS_WEIGHT_BELOW_CONTENT'] })
  })

  test('sem peso de um dos lados, só o volume é conferido', () => {
    const result = evaluatePackageBoxAgainstUnit({
      box: { heightMm: 128, lengthMm: 188, widthMm: 188 },
      unit: LUX_UNIT,
      unitsPerBox: 24,
    })
    expect(result).toEqual({ accepted: true })
  })
})
