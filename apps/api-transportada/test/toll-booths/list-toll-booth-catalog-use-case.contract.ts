/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T202: a ordem da D1 atravessando páginas — vista sem tarifa antes de qualquer praça não
 * vista, mesmo com `osmNodeId` maior — busca, teto de `perPage`, e isolamento de tenant no ajuste.
 */
import { describe, expect, test } from 'bun:test'

import type { TollBoothChargeAdjustmentRow } from '../../src/companies/domain/toll-booth-charge.policy.js'
import type { TollBoothChargePort } from '../../src/companies/application/toll-booth-charge.port.js'
import { createListTollBoothCatalogUseCase } from '../../src/toll-booths/application/list-toll-booth-catalog.use-case.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
} from '../../src/toll-booths/application/toll-booth-catalog.port.js'
import type { TollBoothSightingPort } from '../../src/toll-booths/application/toll-booth-sighting.port.js'

const COMPANY_A = '11111111-1111-1111-1111-111111111111'
const COMPANY_B = '22222222-2222-2222-2222-222222222222'
const TODAY = new Date('2026-09-17T12:00:00.000Z')

type FakeBooth = Readonly<{
  chargePerAxle: null | string
  name: string
  observedOn: string
  operator: string
  osmNodeId: number
}>

function booth(overrides: Partial<FakeBooth> & { readonly osmNodeId: number }): FakeBooth {
  return {
    chargePerAxle: '10.0000',
    name: `Praça ${overrides.osmNodeId}`,
    observedOn: '2026-09-14',
    operator: 'CCR',
    ...overrides,
  }
}

function createFakeCatalog(input: {
  readonly adjustmentsByCompany?: ReadonlyMap<
    string,
    ReadonlyMap<number, TollBoothChargeAdjustmentRow>
  >
  readonly booths: readonly FakeBooth[]
}): TollBoothCatalogPort {
  return {
    async listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage> {
      const seenSet = new Set(params.seenOsmNodeIds)
      let rows = input.booths.filter((candidate) => {
        if (params.seenFilter === 'only') return seenSet.has(candidate.osmNodeId)
        if (params.seenFilter === 'exclude') return !seenSet.has(candidate.osmNodeId)
        return true
      })

      const searchTerm = params.search?.toLowerCase()
      if (searchTerm !== undefined) {
        rows = rows.filter(
          (candidate) =>
            candidate.name.toLowerCase().includes(searchTerm) ||
            candidate.operator.toLowerCase().includes(searchTerm),
        )
      }

      rows = [...rows].sort((left, right) => left.osmNodeId - right.osmNodeId)
      const total = rows.length

      if (params.seenFilter !== 'only') {
        const perPage = params.perPage ?? 20
        const offset = params.offset ?? ((params.page ?? 1) - 1) * perPage
        rows = rows.slice(offset, offset + perPage)
      }

      const companyAdjustments = input.adjustmentsByCompany?.get(params.companyId)

      return {
        page: params.page ?? 1,
        perPage: params.perPage ?? rows.length,
        rows: rows.map((candidate) => ({
          adjustment: companyAdjustments?.get(candidate.osmNodeId) ?? null,
          catalog: {
            chargeCar: null,
            chargePerAxle: candidate.chargePerAxle,
            chargePerAxleAutomatic: null,
            name: candidate.name,
            observedOn: candidate.observedOn,
            operator: candidate.operator,
            osmNodeId: candidate.osmNodeId,
          },
          osmNodeId: candidate.osmNodeId,
          seen: seenSet.has(candidate.osmNodeId),
        })),
        total,
      }
    },
    async readCatalogAxleCharges() {
      return input.booths.map((candidate) => ({
        chargePerAxle: candidate.chargePerAxle,
        osmNodeId: candidate.osmNodeId,
      }))
    },
  }
}

function fakeSightings(osmNodeIds: readonly number[]): TollBoothSightingPort {
  return { readSeenOsmNodeIds: async () => osmNodeIds }
}

function fakeCharges(
  adjustmentsByCompany?: ReadonlyMap<string, ReadonlyMap<number, TollBoothChargeAdjustmentRow>>,
): TollBoothChargePort {
  return {
    async clearAdjustment() {},
    async loadAdjustments(input) {
      return [...(adjustmentsByCompany?.get(input.companyId)?.values() ?? [])]
    },
    async loadAdjustmentsByNodeIds() {
      return []
    },
    async saveAdjustment() {},
  }
}

function fakeCatalogSummary(input: { boothCount: number; latestObservedOn: null | string }) {
  return { readCatalogSummary: async () => input }
}

describe('list toll booth catalog use case (spec 154, T202)', () => {
  test('the D1 order crosses pages: a seen booth without a known charge leads even with a higher osmNodeId', async () => {
    const booths = [
      booth({ chargePerAxle: '12.0000', osmNodeId: 1 }),
      booth({ chargePerAxle: '9.0000', osmNodeId: 2 }),
      booth({ chargePerAxle: null, osmNodeId: 50 }), // seen, unknown charge — must lead
      booth({ chargePerAxle: '8.0000', osmNodeId: 3 }),
      booth({ chargePerAxle: '7.0000', osmNodeId: 4 }),
    ]
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([50]),
    })

    const firstPage = await useCase.execute({ companyId: COMPANY_A, page: 1, perPage: 2 })
    expect(firstPage.rows.map((row) => row.osmNodeId)).toEqual([50, 1])
    expect(firstPage.total).toBe(5)

    const secondPage = await useCase.execute({ companyId: COMPANY_A, page: 2, perPage: 2 })
    expect(secondPage.rows.map((row) => row.osmNodeId)).toEqual([2, 3])

    const thirdPage = await useCase.execute({ companyId: COMPANY_A, page: 3, perPage: 2 })
    expect(thirdPage.rows.map((row) => row.osmNodeId)).toEqual([4])
  })

  test('caps perPage at 100 even when the caller asks for 500', async () => {
    const booths = Array.from({ length: 3 }, (_, index) => booth({ osmNodeId: index + 1 }))
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const page = await useCase.execute({ companyId: COMPANY_A, perPage: 500 })

    expect(page.perPage).toBe(100)
  })

  test('search reaches the name and the operator', async () => {
    const booths = [
      booth({ name: 'Pedágio Anhanguera', operator: 'AutoBAn', osmNodeId: 1 }),
      booth({ name: 'Pedágio Bandeirantes', operator: 'CCR', osmNodeId: 2 }),
    ]
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const page = await useCase.execute({ companyId: COMPANY_A, search: 'anhanguera' })

    expect(page.rows.map((row) => row.osmNodeId)).toEqual([1])
    expect(page.total).toBe(1)
  })

  test('company B never sees company A adjustment on the same booth', async () => {
    const booths = [booth({ chargePerAxle: '10.0000', osmNodeId: 1 })]
    const adjustmentsByCompany = new Map([
      [
        COMPANY_A,
        new Map<number, TollBoothChargeAdjustmentRow>([
          [
            1,
            {
              actorUserId: 'actor-a',
              chargeCar: null,
              chargePerAxle: '5.0000',
              chargePerAxleAutomatic: null,
              observedOn: '2026-09-01',
              osmNodeId: 1,
              updatedAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        ]),
      ],
    ])
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ adjustmentsByCompany, booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const pageForA = await useCase.execute({ companyId: COMPANY_A })
    const pageForB = await useCase.execute({ companyId: COMPANY_B })

    expect(pageForA.rows[0]?.effectiveChargePerAxle).toBe('5.0000')
    expect(pageForA.rows[0]?.source).toBe('manual')
    expect(pageForB.rows[0]?.effectiveChargePerAxle).toBe('10.0000')
    expect(pageForB.rows[0]?.source).toBe('catalog')
  })

  test('carries the RF2 summary: booth count, observed-on age status and the axle-charge gap', async () => {
    const booths = [
      booth({ chargePerAxle: null, osmNodeId: 1 }),
      booth({ chargePerAxle: '10.0000', osmNodeId: 2 }),
    ]
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const page = await useCase.execute({ companyId: COMPANY_A })

    expect(page.summary).toEqual({
      boothCount: 2,
      boothsWithoutAxleChargeCount: 1,
      observedOn: '2026-09-14',
      status: 'current',
    })
  })

  // T202b — decisão do usuário em 2026-09-17: a contagem do RF2 é pendência da EMPRESA, a mesma
  // resposta que `resolveEffectiveTollBoothCharge` daria para cada praça, não o catálogo cru.
  test('the RF2 gap does not count a booth the company already adjusted, but still counts it for another company', async () => {
    const booths = [
      booth({ chargePerAxle: null, osmNodeId: 1 }),
      booth({ chargePerAxle: '10.0000', osmNodeId: 2 }),
    ]
    const adjustmentsByCompany = new Map([
      [
        COMPANY_A,
        new Map<number, TollBoothChargeAdjustmentRow>([
          [
            1,
            {
              actorUserId: 'actor-a',
              chargeCar: null,
              chargePerAxle: '8.5000',
              chargePerAxleAutomatic: null,
              observedOn: '2026-09-01',
              osmNodeId: 1,
              updatedAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        ]),
      ],
    ])
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths }),
      catalogSummary: fakeCatalogSummary({
        boothCount: booths.length,
        latestObservedOn: '2026-09-14',
      }),
      charges: fakeCharges(adjustmentsByCompany),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const pageForA = await useCase.execute({ companyId: COMPANY_A })
    const pageForB = await useCase.execute({ companyId: COMPANY_B })

    expect(pageForA.summary.boothsWithoutAxleChargeCount).toBe(0)
    expect(pageForB.summary.boothsWithoutAxleChargeCount).toBe(1)
  })

  test('an empty catalog answers the empty status, never a lie about missing toll', async () => {
    const useCase = createListTollBoothCatalogUseCase({
      catalog: createFakeCatalog({ booths: [] }),
      catalogSummary: fakeCatalogSummary({ boothCount: 0, latestObservedOn: null }),
      charges: fakeCharges(),
      clock: { now: () => TODAY },
      sightings: fakeSightings([]),
    })

    const page = await useCase.execute({ companyId: COMPANY_A })

    expect(page.summary.status).toBe('empty')
    expect(page.rows).toEqual([])
  })
})
