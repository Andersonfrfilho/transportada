/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF07 — a cubagem lê a medida real primeiro, a estimada só na falta dela.
 */
import { describe, expect, test } from 'bun:test'

import { resolveBoxDimensionsForCubage } from '../../src/nfe-documents/domain/package-box-cubage-dimensions.policy.js'

const NO_MEASURE = { heightMm: null, lengthMm: null, widthMm: null } as const
const NO_ESTIMATE = {
  estimatedHeightMm: null,
  estimatedLengthMm: null,
  estimatedWidthMm: null,
} as const
const ESTIMATE = { estimatedHeightMm: 128, estimatedLengthMm: 188, estimatedWidthMm: 188 } as const

describe('resolveBoxDimensionsForCubage (spec 163, RF07)', () => {
  test('medida real vence a estimativa', () => {
    const resolved = resolveBoxDimensionsForCubage({
      ...ESTIMATE,
      heightMm: 130,
      lengthMm: 190,
      widthMm: 185,
    })
    expect(resolved).toEqual({
      dims: { heightMm: 130, lengthMm: 190, widthMm: 185 },
      isEstimated: false,
    })
  })

  test('sem medida real, usa a estimada e marca isEstimated', () => {
    expect(resolveBoxDimensionsForCubage({ ...NO_MEASURE, ...ESTIMATE })).toEqual({
      dims: { heightMm: 128, lengthMm: 188, widthMm: 188 },
      isEstimated: true,
    })
  })

  test('medida real incompleta não vale como medida — cai na estimada', () => {
    expect(
      resolveBoxDimensionsForCubage({ ...ESTIMATE, heightMm: null, lengthMm: 190, widthMm: 185 }),
    ).toEqual({ dims: { heightMm: 128, lengthMm: 188, widthMm: 188 }, isEstimated: true })
  })

  test('sem nenhuma das duas → undefined', () => {
    expect(resolveBoxDimensionsForCubage({ ...NO_MEASURE, ...NO_ESTIMATE })).toBeUndefined()
  })

  test('campos de estimativa ausentes (leitor antigo) → só a medida real conta', () => {
    expect(resolveBoxDimensionsForCubage(NO_MEASURE)).toBeUndefined()
  })
})
