/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createListTollBoothChargesUseCase } from '../../src/companies/application/list-toll-booth-charges.use-case.js'
import type { TollBoothChargeAdjustmentRow } from '../../src/companies/domain/toll-booth-charge.policy.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const COMPANY_ID = 'company-1'

function booth(overrides: Partial<TollBoothRouteRecord> = {}): TollBoothRouteRecord {
  return {
    chargeCar: '10.5000',
    chargePerAxle: '10.5000',
    chargePerAxleAutomatic: null,
    latitude: '-21.1000000',
    longitude: '-47.8000000',
    name: 'Praça SP-330',
    observedOn: '2026-06-01',
    operator: 'CCR',
    osmNodeId: 111,
    ...overrides,
  }
}

describe('list toll booth charges use case (spec 095 item 4)', () => {
  test('answers empty when the company has never seen a toll booth in any planned route', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: { readByNodeIds: async () => [booth()] },
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async () => [],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [] },
    })

    expect(await useCase.execute({ companyId: COMPANY_ID })).toEqual([])
  })

  // Corrigir praça por onde ninguém passa é trabalho jogado fora (spec 095) — vista, mas sem ajuste
  test('answers a seen booth even without any adjustment', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: { readByNodeIds: async () => [booth()] },
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async () => [],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [111] },
    })

    const result = await useCase.execute({ companyId: COMPANY_ID })

    expect(result).toHaveLength(1)
    expect(result[0]?.osmNodeId).toBe(111)
    expect(result[0]?.source).toBe('catalog')
    expect(result[0]?.effectiveChargePerAxle).toBe('10.5000')
  })

  test('merges the adjustment over the seen catalog entry', async () => {
    const adjustment: TollBoothChargeAdjustmentRow = {
      actorUserId: 'user-1',
      chargeCar: null,
      chargePerAxle: '9.9000',
      chargePerAxleAutomatic: null,
      observedOn: '2026-09-07',
      osmNodeId: 111,
      updatedAt: new Date('2026-09-07T12:00:00.000Z'),
    }
    const useCase = createListTollBoothChargesUseCase({
      catalog: { readByNodeIds: async () => [booth()] },
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async () => [adjustment],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [111] },
    })

    const result = await useCase.execute({ companyId: COMPANY_ID })

    expect(result[0]?.source).toBe('manual')
    expect(result[0]?.effectiveChargePerAxle).toBe('9.9000')
  })

  // As sem tarifa conhecida sobem primeiro — são o motivo da página existir
  test('orders the unknown ones first', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: {
        readByNodeIds: async () => [
          booth({ chargePerAxle: '10.5000', name: 'Praça conhecida', osmNodeId: 111 }),
          booth({ chargePerAxle: null, name: 'Praça sem tarifa', osmNodeId: 222 }),
        ],
      },
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async () => [],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [111, 222] },
    })

    const result = await useCase.execute({ companyId: COMPANY_ID })

    expect(result.map((entry) => entry.osmNodeId)).toEqual([222, 111])
  })

  // A FK garante a praça no catálogo; ausência aqui só existiria com dado inconsistente
  test('skips a seen node id absent from the catalog', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: { readByNodeIds: async () => [] },
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async () => [],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [999] },
    })

    expect(await useCase.execute({ companyId: COMPANY_ID })).toEqual([])
  })
})
