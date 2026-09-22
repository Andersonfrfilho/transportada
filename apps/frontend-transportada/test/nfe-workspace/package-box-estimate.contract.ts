/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  packageBoxQueueFromApi,
  type PackageBox,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'
import {
  buildPackageBoxEstimateConfirmation,
  describePackageBoxEstimate,
  describePackageBoxUnit,
} from '@/modules/nfe-workspace/shared/packageBoxEstimate.service'

const BASE_BOX: PackageBox = {
  cartonGtin: '17891150039503',
  commercialUnit: 'CX24',
  cumulativeShare: 0.1,
  description: 'SAB LUX BOTANICALS 85G',
  emitterTaxId: '05868574001090',
  familyKey: undefined,
  familyMeasuredCount: 0,
  familyPendingCount: 1,
  grossWeightGrams: null,
  heightMm: null,
  id: '00000000-0000-4000-8000-0000000000b1',
  lengthMm: null,
  measuredAt: null,
  measurementMarginMm: null,
  measurementSource: null,
  packagingSiblingCount: 0,
  packagingUnitCount: 24,
  productCode: '7891',
  share: 0.1,
  transportedVolumes: 48,
  unitsPerBox: 24,
  variantLabel: '',
  widthMm: null,
  withinCoverage: true,
}

const ESTIMATED_BOX: PackageBox = {
  ...BASE_BOX,
  estimate: {
    arrangement: '2x2x6',
    estimatedAt: '2026-09-22T12:00:00.000Z',
    grossWeightGrams: 2142,
    heightMm: 128,
    lengthMm: 188,
    volumeCm3: 4524,
    widthMm: 188,
  },
  isEstimated: true,
  unit: { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, source: 'typed', widthMm: 90 },
}

describe('caixa estimada pela unidade na fila (spec 163, RF09/P5)', () => {
  it('descreve a estimativa com o arranjo em × e as medidas em cm', () => {
    expect(describePackageBoxEstimate(ESTIMATED_BOX)).toEqual({
      arrangement: '2 × 2 × 6',
      grossWeightKg: '2,142',
      height: '12,8',
      length: '18,8',
      volumeLitres: '4,5',
      width: '18,8',
    })
  })

  it('sem isEstimated (caixa medida ou sem estimativa) não há selo', () => {
    expect(describePackageBoxEstimate({ ...ESTIMATED_BOX, isEstimated: false })).toBeUndefined()
    expect(describePackageBoxEstimate(BASE_BOX)).toBeUndefined()
  })

  it('confirmar grava a estimativa como medida DIGITADA (typed), decisão humana', () => {
    expect(buildPackageBoxEstimateConfirmation(ESTIMATED_BOX)).toEqual({
      grossWeightGrams: 2142,
      heightMm: 128,
      id: ESTIMATED_BOX.id,
      lengthMm: 188,
      source: 'typed',
      unitsPerBox: 24,
      widthMm: 188,
    })
  })

  it('sem estimativa não há o que confirmar', () => {
    expect(buildPackageBoxEstimateConfirmation(BASE_BOX)).toBeUndefined()
  })

  it('descreve a unidade informada em cm e g', () => {
    expect(describePackageBoxUnit(ESTIMATED_BOX)).toEqual({
      grossWeightGrams: 85,
      height: '3',
      length: '6',
      width: '9',
    })
    expect(describePackageBoxUnit(BASE_BOX)).toBeUndefined()
  })
})

describe('a fila aceita unit, estimate e isEstimated da API (RF08)', () => {
  it('com os campos novos, a caixa passa pelo guard', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 1, items: [ESTIMATED_BOX], totalVolumes: 48 },
    })
    expect(queue.items[0]?.isEstimated).toBe(true)
    expect(queue.items[0]?.estimate?.arrangement).toBe('2x2x6')
  })

  it('sem os campos novos (API anterior), a caixa continua passando', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 0, items: [BASE_BOX], totalVolumes: 48 },
    })
    expect(queue.items).toHaveLength(1)
  })

  it('estimate malformada derruba a fila, nunca vira estimativa silenciosa', () => {
    expect(() =>
      packageBoxQueueFromApi({
        data: {
          coveredCount: 0,
          items: [{ ...ESTIMATED_BOX, estimate: { lengthMm: '188' } }],
          totalVolumes: 0,
        },
      }),
    ).toThrow()
  })
})
