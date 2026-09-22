/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T203: `list-toll-booth-charges.use-case.ts` não muda de assunto — continua sendo a lista
 * das praças vistas, para a rota antiga de `company-settings` — mas passa a sair do
 * `TollBoothCatalogPort` novo (`seenFilter: 'only'`), o mesmo que alimenta `GET /v1/toll-booths`
 * (T202). Este contrato prova que, para a mesma praça, as duas concordam: valor efetivo, origem por
 * campo, e que toda praça da lista antiga aparece como `seen: true` no catálogo novo.
 */
import { describe, expect, test } from 'bun:test'

import { createListTollBoothChargesUseCase } from '../../src/companies/application/list-toll-booth-charges.use-case.js'
import type { TollBoothChargeAdjustmentRow } from '../../src/companies/domain/toll-booth-charge.policy.js'
import type { TollBoothChargePort } from '../../src/companies/application/toll-booth-charge.port.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
} from '../../src/toll-booths/application/toll-booth-catalog.port.js'
import type { TollBoothSightingPort } from '../../src/toll-booths/application/toll-booth-sighting.port.js'

const COMPANY_ID = 'company-1'

type FakeBooth = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  chargePerAxleAutomatic: null | string
  name: string
  observedOn: string
  operator: string
  osmNodeId: number
}>

function booth(overrides: Partial<FakeBooth> & { readonly osmNodeId: number }): FakeBooth {
  return {
    chargeCar: '10.5000',
    chargePerAxle: '10.5000',
    chargePerAxleAutomatic: null,
    name: `Praça ${overrides.osmNodeId}`,
    observedOn: '2026-06-01',
    operator: 'CCR',
    ...overrides,
  }
}

/** Mesma semântica de `seenFilter` que `drizzle-toll-booth-catalog.repository.ts` implementa. */
function createFakeCatalog(input: {
  readonly adjustments: ReadonlyMap<number, TollBoothChargeAdjustmentRow>
  readonly booths: readonly FakeBooth[]
}): TollBoothCatalogPort {
  return {
    async listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage> {
      const seenSet = new Set(params.seenOsmNodeIds)
      const rows =
        params.seenFilter === 'only'
          ? input.booths.filter((candidate) => seenSet.has(candidate.osmNodeId))
          : input.booths

      return {
        page: 1,
        perPage: rows.length,
        rows: rows.map((candidate) => ({
          adjustment: input.adjustments.get(candidate.osmNodeId) ?? null,
          catalog: {
            chargeCar: candidate.chargeCar,
            chargePerAxle: candidate.chargePerAxle,
            chargePerAxleAutomatic: candidate.chargePerAxleAutomatic,
            name: candidate.name,
            observedOn: candidate.observedOn,
            operator: candidate.operator,
            osmNodeId: candidate.osmNodeId,
          },
          osmNodeId: candidate.osmNodeId,
          seen: seenSet.has(candidate.osmNodeId),
        })),
        total: rows.length,
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
  adjustments: ReadonlyMap<number, TollBoothChargeAdjustmentRow>,
): TollBoothChargePort {
  return {
    async clearAdjustment() {},
    async loadAdjustments() {
      return [...adjustments.values()]
    },
    async loadAdjustmentsByNodeIds(request) {
      return request.osmNodeIds
        .map((osmNodeId) => adjustments.get(osmNodeId))
        .filter((row): row is TollBoothChargeAdjustmentRow => row !== undefined)
    },
    async saveAdjustment() {},
  }
}

describe('a lista antiga concorda com o catálogo novo, praça a praça (spec 154 T203)', () => {
  test('mesmo valor efetivo e mesma origem por campo, com ajuste parcial (só o valor por eixo corrigido)', async () => {
    const booths = [
      booth({ chargeCar: '4.2000', chargePerAxle: '10.0000', osmNodeId: 111 }),
      booth({ chargeCar: '5.0000', chargePerAxle: null, osmNodeId: 222 }),
    ]
    const adjustments = new Map<number, TollBoothChargeAdjustmentRow>([
      [
        111,
        {
          actorUserId: 'user-1',
          chargeCar: null,
          chargePerAxle: '8.5000',
          chargePerAxleAutomatic: null,
          observedOn: '2026-09-07',
          osmNodeId: 111,
          updatedAt: new Date('2026-09-07T12:00:00.000Z'),
        },
      ],
    ])
    const catalog = createFakeCatalog({ adjustments, booths })
    const charges = fakeCharges(adjustments)
    const sightings = fakeSightings([111, 222])

    const oldList = await createListTollBoothChargesUseCase({
      catalog,
      charges,
      sightings,
    }).execute({
      companyId: COMPANY_ID,
    })

    const newPage = await catalog.listCatalog({
      companyId: COMPANY_ID,
      seenFilter: 'only',
      seenOsmNodeIds: [111, 222],
    })

    expect(oldList).toHaveLength(2)
    for (const oldEntry of oldList) {
      const newRow = newPage.rows.find((row) => row.osmNodeId === oldEntry.osmNodeId)
      expect(newRow).toBeDefined()
      expect(newRow?.seen).toBe(true)

      // valor efetivo — a mesma praça, o mesmo número, nas duas listas
      expect(newRow?.catalog.chargeCar ?? null).toBe(
        oldEntry.chargeCarSource === 'catalog'
          ? oldEntry.effectiveChargeCar
          : oldEntry.catalog.chargeCar,
      )

      // origem por campo: eixo veio do ajuste (manual), carro continua do catálogo — nas duas listas
      if (oldEntry.osmNodeId === 111) {
        expect(oldEntry.chargePerAxleSource).toBe('manual')
        expect(oldEntry.chargeCarSource).toBe('catalog')
        expect(oldEntry.effectiveChargePerAxle).toBe('8.5000')
        expect(oldEntry.effectiveChargeCar).toBe('4.2000')
        expect(newRow?.adjustment?.chargePerAxle).toBe('8.5000')
        expect(newRow?.adjustment?.chargeCar).toBeNull()
        expect(newRow?.catalog.chargeCar).toBe('4.2000')
      }

      if (oldEntry.osmNodeId === 222) {
        expect(oldEntry.chargePerAxleSource).toBe('catalog')
        expect(oldEntry.effectiveChargePerAxle).toBeNull()
        expect(newRow?.adjustment).toBeNull()
        expect(newRow?.catalog.chargePerAxle).toBeNull()
      }
    }
  })

  test('praça sem ajuste algum: as duas listas concordam que a origem é o catálogo', async () => {
    const booths = [booth({ chargeCar: '3.0000', chargePerAxle: '6.0000', osmNodeId: 333 })]
    const adjustments = new Map<number, TollBoothChargeAdjustmentRow>()
    const catalog = createFakeCatalog({ adjustments, booths })
    const charges = fakeCharges(adjustments)
    const sightings = fakeSightings([333])

    const oldList = await createListTollBoothChargesUseCase({
      catalog,
      charges,
      sightings,
    }).execute({
      companyId: COMPANY_ID,
    })
    const newPage = await catalog.listCatalog({
      companyId: COMPANY_ID,
      seenFilter: 'only',
      seenOsmNodeIds: [333],
    })

    expect(oldList[0]?.source).toBe('catalog')
    expect(oldList[0]?.effectiveChargeCar).toBe('3.0000')
    expect(oldList[0]?.effectiveChargePerAxle).toBe('6.0000')
    expect(newPage.rows[0]?.adjustment).toBeNull()
    expect(newPage.rows[0]?.catalog.chargeCar).toBe('3.0000')
    expect(newPage.rows[0]?.catalog.chargePerAxle).toBe('6.0000')
    expect(newPage.rows[0]?.seen).toBe(true)
  })
})
