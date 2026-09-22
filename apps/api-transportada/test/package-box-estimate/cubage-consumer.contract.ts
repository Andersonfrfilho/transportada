/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF07/P3 (T007) — a ocupação e a planta leem a caixa por
 * `resolveBoxDimensionsForCubage`: medida real primeiro, estimada na falta dela, e a nota que usou
 * caixa estimada nunca sai como `measured`.
 */
import { describe, expect, test } from 'bun:test'

import type { ResolvedDocumentCargoEstimate } from '../../src/nfe-documents/domain/cargo-volume.policy.js'
import {
  markDocumentsWithEstimatedBoxes,
  resolveCubageBoxRow,
} from '../../src/trips/infrastructure/trip-occupancy.support.js'

const NO_ESTIMATE = {
  estimatedHeightMm: null,
  estimatedLengthMm: null,
  estimatedWidthMm: null,
} as const

describe('resolveCubageBoxRow (spec 163, T007)', () => {
  test('medida real: dimensões e m³ com seis casas, idênticos ao round(…, 6) do Postgres', () => {
    expect(
      resolveCubageBoxRow({ ...NO_ESTIMATE, heightMm: 210, lengthMm: 380, widthMm: 260 }),
    ).toEqual({
      boxVolumeM3: '0.020748',
      heightMm: 210,
      isEstimated: false,
      lengthMm: 380,
      widthMm: 260,
    })
  })

  test('arredonda a sexta casa para cima no meio, como o numeric do Postgres', () => {
    // 1001 × 1001 × 1 mm = 1 002 001 mm³ = 0,001002001 m³ → 0.001002
    expect(
      resolveCubageBoxRow({ ...NO_ESTIMATE, heightMm: 1, lengthMm: 1001, widthMm: 1001 })
        .boxVolumeM3,
    ).toBe('0.001002')
    // 1500 × 1000 × 1 mm = 0,0015 m³ exato
    expect(
      resolveCubageBoxRow({ ...NO_ESTIMATE, heightMm: 1, lengthMm: 1500, widthMm: 1000 })
        .boxVolumeM3,
    ).toBe('0.001500')
    // 2500 × 2500 × 2500 mm = 15,625 m³
    expect(
      resolveCubageBoxRow({ ...NO_ESTIMATE, heightMm: 2500, lengthMm: 2500, widthMm: 2500 })
        .boxVolumeM3,
    ).toBe('15.625000')
  })

  test('sem medida real, usa a caixa estimada e marca isEstimated', () => {
    expect(
      resolveCubageBoxRow({
        estimatedHeightMm: 128,
        estimatedLengthMm: 188,
        estimatedWidthMm: 188,
        heightMm: null,
        lengthMm: null,
        widthMm: null,
      }),
    ).toEqual({
      boxVolumeM3: '0.004524',
      heightMm: 128,
      isEstimated: true,
      lengthMm: 188,
      widthMm: 188,
    })
  })

  test('sem nenhuma das duas: tudo nulo, como a caixa sem ficha de antes', () => {
    expect(
      resolveCubageBoxRow({ ...NO_ESTIMATE, heightMm: null, lengthMm: null, widthMm: null }),
    ).toEqual({
      boxVolumeM3: null,
      heightMm: null,
      isEstimated: false,
      lengthMm: null,
      widthMm: null,
    })
  })
})

describe('markDocumentsWithEstimatedBoxes (spec 163, P3)', () => {
  const measured: ResolvedDocumentCargoEstimate = {
    estimateSource: 'none',
    source: 'measured',
    unmeasuredBoxCount: 0,
    unmeasuredBoxVolumeM3: null,
    volumeM3: '0.090000',
  }

  test('nota "medida" que usou caixa estimada passa a partial — a pior origem manda', () => {
    const result = markDocumentsWithEstimatedBoxes(
      new Map([
        ['with-estimate', measured],
        ['real-only', measured],
      ]),
      new Set(['with-estimate']),
    )
    expect(result.get('with-estimate')?.source).toBe('partial')
    expect(result.get('with-estimate')?.volumeM3).toBe('0.090000')
    expect(result.get('real-only')?.source).toBe('measured')
  })

  test('origem já pior que measured não melhora', () => {
    const result = markDocumentsWithEstimatedBoxes(
      new Map([['doc', { ...measured, source: 'estimated' as const }]]),
      new Set(['doc']),
    )
    expect(result.get('doc')?.source).toBe('estimated')
  })
})
