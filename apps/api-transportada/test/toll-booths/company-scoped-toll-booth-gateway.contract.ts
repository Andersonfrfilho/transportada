/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCompanyScopedTollBoothGateway } from '../../src/trips/infrastructure/company-scoped-toll-booth.gateway.js'
import type { TollBoothChargePort } from '../../src/companies/application/toll-booth-charge.port.js'
import type {
  TollBoothRepository,
  TollBoothRouteRecord,
} from '../../src/toll-booths/application/toll-booth.port.js'

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'

function catalogRecord(overrides: Partial<TollBoothRouteRecord> = {}): TollBoothRouteRecord {
  return {
    chargeCar: '10.50',
    chargePerAxle: '10.50',
    chargePerAxleAutomatic: null,
    latitude: '-21.1699500',
    longitude: '-47.8099400',
    name: 'Praça SP-330',
    observedOn: '2026-06-01',
    operator: 'CCR',
    osmNodeId: 111,
    ...overrides,
  }
}

function fakeCatalog(records: readonly TollBoothRouteRecord[]): TollBoothRepository {
  return {
    readByNodeIds: async () => records,
    saveMany: async () => 0,
  }
}

function fakeCharges(
  rows: readonly {
    readonly actorUserId: string
    readonly chargeCar: null | string
    readonly chargePerAxle: null | string
    readonly chargePerAxleAutomatic: null | string
    readonly observedOn: string
    readonly osmNodeId: number
    readonly updatedAt: Date
  }[],
): TollBoothChargePort {
  return {
    clearAdjustment: async () => {},
    loadAdjustments: async () => rows,
    loadAdjustmentsByNodeIds: async () => rows,
    saveAdjustment: async () => {},
  }
}

describe('company-scoped toll booth gateway (spec 095 D1)', () => {
  test('substitutes the catalog charge with the manual adjustment, per field', async () => {
    const gateway = createCompanyScopedTollBoothGateway({
      catalog: fakeCatalog([catalogRecord()]),
      charges: fakeCharges([
        {
          actorUserId: 'user-1',
          chargeCar: null,
          chargePerAxle: '12.00',
          chargePerAxleAutomatic: null,
          observedOn: '2026-09-01',
          osmNodeId: 111,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      companyId: COMPANY_ID,
    })

    const result = await gateway.readByNodeIds([111])

    expect(result).toEqual([catalogRecord({ chargeCar: '10.50', chargePerAxle: '12.00' })])
  })

  test('leaves the catalog untouched when the company has no adjustment for that node', async () => {
    const gateway = createCompanyScopedTollBoothGateway({
      catalog: fakeCatalog([catalogRecord()]),
      charges: fakeCharges([]),
      companyId: COMPANY_ID,
    })

    const result = await gateway.readByNodeIds([111])

    expect(result).toEqual([catalogRecord()])
  })

  // 0.00 gravado à mão é isenção afirmada — vence o `null` "desconhecida" do catálogo
  test('a manual 0.00 wins over an unknown catalog charge', async () => {
    const gateway = createCompanyScopedTollBoothGateway({
      catalog: fakeCatalog([catalogRecord({ chargeCar: null, chargePerAxle: null })]),
      charges: fakeCharges([
        {
          actorUserId: 'user-1',
          chargeCar: '0.0000',
          chargePerAxle: '0.0000',
          chargePerAxleAutomatic: null,
          observedOn: '2026-09-01',
          osmNodeId: 111,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      companyId: COMPANY_ID,
    })

    const result = await gateway.readByNodeIds([111])

    expect(result[0]?.chargeCar).toBe('0.0000')
    expect(result[0]?.chargePerAxle).toBe('0.0000')
  })

  /** Spec 095 D3: a automática também vence o catálogo, por campo — como carro e por eixo. */
  test('the manual adjustment can correct the automatic charge too', async () => {
    const gateway = createCompanyScopedTollBoothGateway({
      catalog: fakeCatalog([catalogRecord({ chargePerAxleAutomatic: null })]),
      charges: fakeCharges([
        {
          actorUserId: 'user-1',
          chargeCar: null,
          chargePerAxle: null,
          chargePerAxleAutomatic: '9.97',
          observedOn: '2026-09-01',
          osmNodeId: 111,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      companyId: COMPANY_ID,
    })

    const result = await gateway.readByNodeIds([111])

    expect(result[0]?.chargePerAxleAutomatic).toBe('9.97')
    expect(result[0]?.chargePerAxle).toBe('10.50')
  })
})
