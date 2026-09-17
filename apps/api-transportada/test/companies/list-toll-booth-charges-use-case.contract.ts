/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Spec 154 T203: o `catalog` deste use case passou a ser `TollBoothCatalogPort.listCatalog` com
 * `seenFilter: 'only'` (o mesmo contrato de `GET /v1/toll-booths`), no lugar de
 * `TollBoothCatalogLookupPort.readByNodeIds`. `createFakeCatalog` reproduz só o recorte que este use
 * case exercita: filtra os `booths` pelos `seenOsmNodeIds` recebidos e já embute o ajuste da empresa
 * na linha, como o `LEFT JOIN` real faria.
 */
import { describe, expect, test } from 'bun:test'

import { createListTollBoothChargesUseCase } from '../../src/companies/application/list-toll-booth-charges.use-case.js'
import type {
  TollBoothCatalogEntry,
  TollBoothChargeAdjustmentRow,
} from '../../src/companies/domain/toll-booth-charge.policy.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
} from '../../src/toll-booths/application/toll-booth-catalog.port.js'

const COMPANY_ID = 'company-1'

function booth(overrides: Partial<TollBoothCatalogEntry> = {}): TollBoothCatalogEntry {
  return {
    chargeCar: '10.5000',
    chargePerAxle: '10.5000',
    chargePerAxleAutomatic: null,
    name: 'Praça SP-330',
    observedOn: '2026-06-01',
    operator: 'CCR',
    osmNodeId: 111,
    ...overrides,
  }
}

/** Só o recorte que `list-toll-booth-charges.use-case.ts` exercita: sempre `seenFilter: 'only'`. */
function createFakeCatalog(input: {
  readonly adjustments?: ReadonlyMap<number, TollBoothChargeAdjustmentRow>
  readonly booths: readonly TollBoothCatalogEntry[]
}): TollBoothCatalogPort {
  return {
    async listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage> {
      const seenSet = new Set(params.seenOsmNodeIds)
      const rows = input.booths.filter((candidate) => seenSet.has(candidate.osmNodeId))

      return {
        page: 1,
        perPage: rows.length,
        rows: rows.map((candidate) => ({
          adjustment: input.adjustments?.get(candidate.osmNodeId) ?? null,
          catalog: candidate,
          osmNodeId: candidate.osmNodeId,
          seen: true,
        })),
        total: rows.length,
      }
    },
    async readCatalogAxleCharges() {
      return []
    },
  }
}

describe('list toll booth charges use case (spec 095 item 4)', () => {
  test('answers empty when the company has never seen a toll booth in any planned route', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: createFakeCatalog({ booths: [booth()] }),
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
      catalog: createFakeCatalog({ booths: [booth()] }),
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
      catalog: createFakeCatalog({
        adjustments: new Map([[111, adjustment]]),
        booths: [booth()],
      }),
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
      catalog: createFakeCatalog({
        booths: [
          booth({ chargePerAxle: '10.5000', name: 'Praça conhecida', osmNodeId: 111 }),
          booth({ chargePerAxle: null, name: 'Praça sem tarifa', osmNodeId: 222 }),
        ],
      }),
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
      catalog: createFakeCatalog({ booths: [] }),
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

describe('praça que saiu do catálogo (revisão de 2026-09-08)', () => {
  /**
   * ⚠️ A lista era montada a partir do catálogo, e praça vista em viagem mas **ausente do catálogo
   * atual** sumia da tela levando junto o ajuste que a transportadora fez à mão — gravado,
   * invisível e inalcançável. Acontece quando o runbook recarrega `toll_booths` de um extract em que
   * o nó foi removido do OSM.
   *
   * Ajuste é trabalho de gente, e não some por decisão de um mapa de terceiro.
   */
  test('mantém na lista a praça ajustada que o catálogo não conhece mais', async () => {
    const useCase = createListTollBoothChargesUseCase({
      catalog: createFakeCatalog({ booths: [] }),
      charges: {
        clearAdjustment: async () => {},
        loadAdjustments: async () => [],
        loadAdjustmentsByNodeIds: async (): Promise<readonly TollBoothChargeAdjustmentRow[]> => [
          {
            actorUserId: 'user-1',
            chargeCar: null,
            chargePerAxle: '12.3000',
            chargePerAxleAutomatic: null,
            observedOn: '2026-08-01',
            osmNodeId: 5_219_021_670,
            updatedAt: new Date('2026-08-01T12:00:00.000Z'),
          },
        ],
        saveAdjustment: async () => {},
      },
      sightings: { readSeenOsmNodeIds: async () => [5_219_021_670] },
    })

    const linhas = await useCase.execute({ companyId: COMPANY_ID })

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.osmNodeId).toBe(5_219_021_670)
    expect(linhas[0]?.effectiveChargePerAxle).toBe('12.3000')
    expect(linhas[0]?.catalogKnown).toBe(false)
  })
})
