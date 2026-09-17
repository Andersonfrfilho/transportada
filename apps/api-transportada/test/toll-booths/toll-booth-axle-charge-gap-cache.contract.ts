/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 2): a contagem de "sem tarifa por eixo conhecida" (RF2)
 * não depende de `page` nem `search` — só do catálogo inteiro e dos ajustes da empresa —, mas
 * `list-toll-booth-catalog.use-case.ts` recalculava em toda requisição, lendo `toll_booths`
 * inteira mesmo quando só a página ou a busca mudavam. `TollBoothAxleChargeGapCachePort` (por
 * empresa, em memória do processo) evita isso; este contrato prova as duas pontas: a leitura não
 * recalcula sem necessidade, e as mutações que podem mudar o resultado invalidam a cópia certa.
 */
import { describe, expect, test } from 'bun:test'

import { createAdjustTollBoothChargeUseCase } from '../../src/companies/application/adjust-toll-booth-charge.use-case.js'
import { createClearTollBoothChargeUseCase } from '../../src/companies/application/clear-toll-booth-charge.use-case.js'
import type { TollBoothCatalogLookupPort } from '../../src/companies/application/list-toll-booth-charges.use-case.js'
import type { TollBoothChargePort } from '../../src/companies/application/toll-booth-charge.port.js'
import { createListTollBoothCatalogUseCase } from '../../src/toll-booths/application/list-toll-booth-catalog.use-case.js'
import type {
  ListTollBoothCatalogParams,
  TollBoothCatalogAxleChargeRow,
  TollBoothCatalogPage,
  TollBoothCatalogPort,
} from '../../src/toll-booths/application/toll-booth-catalog.port.js'
import type { TollBoothSightingPort } from '../../src/toll-booths/application/toll-booth-sighting.port.js'
import { createInMemoryTollBoothAxleChargeGapCache } from '../../src/toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.js'
import {
  buildExtractRow,
  encodeExtract,
  RELOAD_BOOTH_ROW,
} from '../fixtures/toll-booth-reload-http.fixture.js'
import { createReloadPorts } from '../fixtures/toll-booth-reload-ports.fixture.js'

const COMPANY_A = '11111111-1111-1111-1111-111111111111'
const COMPANY_B = '22222222-2222-2222-2222-222222222222'
const TODAY = new Date('2026-09-17T12:00:00.000Z')

function countingCatalog(booths: readonly TollBoothCatalogAxleChargeRow[]): {
  readCatalogAxleChargesCallCount: number
} & TollBoothCatalogPort {
  const state = { readCatalogAxleChargesCallCount: 0 }
  return {
    get readCatalogAxleChargesCallCount() {
      return state.readCatalogAxleChargesCallCount
    },
    async listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage> {
      return { page: params.page ?? 1, perPage: params.perPage ?? 0, rows: [], total: 0 }
    },
    async readCatalogAxleCharges() {
      state.readCatalogAxleChargesCallCount += 1
      return booths
    },
  }
}

function countingCharges(): { loadAdjustmentsCallCount: number } & TollBoothChargePort {
  const state = { loadAdjustmentsCallCount: 0 }
  return {
    get loadAdjustmentsCallCount() {
      return state.loadAdjustmentsCallCount
    },
    async clearAdjustment() {},
    async loadAdjustments() {
      state.loadAdjustmentsCallCount += 1
      return []
    },
    async loadAdjustmentsByNodeIds() {
      return []
    },
    async saveAdjustment() {},
  }
}

function fakeSightings(): TollBoothSightingPort {
  return { readSeenOsmNodeIds: async () => [] }
}

function fakeCatalogSummary() {
  return { readCatalogSummary: async () => ({ boothCount: 1, latestObservedOn: '2026-09-14' }) }
}

describe('cache da contagem "sem tarifa por eixo conhecida" (spec 154 T503, defeito 2)', () => {
  test('trocar de página ou de busca não recalcula a contagem para a mesma empresa', async () => {
    const catalog = countingCatalog([{ chargePerAxle: null, osmNodeId: 1 }])
    const charges = countingCharges()
    const axleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache()
    const useCase = createListTollBoothCatalogUseCase({
      axleChargeGapCache,
      catalog,
      catalogSummary: fakeCatalogSummary(),
      charges,
      clock: { now: () => TODAY },
      sightings: fakeSightings(),
    })

    const first = await useCase.execute({ companyId: COMPANY_A, page: 1 })
    const second = await useCase.execute({ companyId: COMPANY_A, page: 2, search: 'sp' })
    const third = await useCase.execute({ companyId: COMPANY_A, page: 3, search: 'outra busca' })

    expect(first.summary.boothsWithoutAxleChargeCount).toBe(1)
    expect(second.summary.boothsWithoutAxleChargeCount).toBe(1)
    expect(third.summary.boothsWithoutAxleChargeCount).toBe(1)
    expect(catalog.readCatalogAxleChargesCallCount).toBe(1)
    expect(charges.loadAdjustmentsCallCount).toBe(1)
  })

  test('empresas diferentes não compartilham a mesma cópia em cache', async () => {
    const catalog = countingCatalog([{ chargePerAxle: null, osmNodeId: 1 }])
    const charges = countingCharges()
    const axleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache()
    const useCase = createListTollBoothCatalogUseCase({
      axleChargeGapCache,
      catalog,
      catalogSummary: fakeCatalogSummary(),
      charges,
      clock: { now: () => TODAY },
      sightings: fakeSightings(),
    })

    await useCase.execute({ companyId: COMPANY_A })
    await useCase.execute({ companyId: COMPANY_B })

    expect(catalog.readCatalogAxleChargesCallCount).toBe(2)
  })

  test('ajustar uma praça invalida só a cópia da empresa que ajustou', () => {
    const axleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache()
    axleChargeGapCache.write(COMPANY_A, 3)
    axleChargeGapCache.write(COMPANY_B, 5)

    const catalog: TollBoothCatalogLookupPort = {
      async readByNodeIds(osmNodeIds) {
        return osmNodeIds.map((osmNodeId) => ({
          chargeCar: null,
          chargePerAxle: '10.0000',
          chargePerAxleAutomatic: null,
          latitude: '-22.0000',
          longitude: '-47.0000',
          name: 'Praça X',
          observedOn: '2026-09-14',
          operator: 'CCR',
          osmNodeId,
        }))
      },
    }
    const charges: TollBoothChargePort = {
      async clearAdjustment() {},
      async loadAdjustments() {
        return []
      },
      async loadAdjustmentsByNodeIds() {
        return []
      },
      async saveAdjustment() {},
    }
    const useCase = createAdjustTollBoothChargeUseCase({ axleChargeGapCache, catalog, charges })

    return useCase
      .execute({
        actorUserId: 'user-1',
        chargeCar: null,
        chargePerAxle: '10.0000',
        chargePerAxleAutomatic: null,
        companyId: COMPANY_A,
        observedOn: '2026-09-17',
        osmNodeId: 1,
      })
      .then(() => {
        expect(axleChargeGapCache.read(COMPANY_A)).toBeUndefined()
        expect(axleChargeGapCache.read(COMPANY_B)).toBe(5)
      })
  })

  test('remover um ajuste também invalida a cópia da empresa', async () => {
    const axleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache()
    axleChargeGapCache.write(COMPANY_A, 3)

    const useCase = createClearTollBoothChargeUseCase({
      axleChargeGapCache,
      charges: {
        async clearAdjustment() {},
        async loadAdjustments() {
          return []
        },
        async loadAdjustmentsByNodeIds() {
          return []
        },
        async saveAdjustment() {},
      },
    })

    await useCase.execute({ companyId: COMPANY_A, osmNodeId: 1 })

    expect(axleChargeGapCache.read(COMPANY_A)).toBeUndefined()
  })

  test('recarregar o catálogo invalida a cópia de TODA empresa, não só a que disparou a recarga', async () => {
    const bytes = encodeExtract([RELOAD_BOOTH_ROW])
    const extract = buildExtractRow(bytes)
    const { axleChargeGapCache, useCase } = createReloadPorts({
      extract,
      objectBytes: bytes,
    })
    axleChargeGapCache.write(COMPANY_A, 3)
    axleChargeGapCache.write(COMPANY_B, 5)

    await useCase.execute({
      actorUserId: 'user-1',
      companyId: COMPANY_A,
      correlationId: 'correlation-1',
      dataset: extract.dataset,
      observedOn: extract.observedOn,
    })

    expect(axleChargeGapCache.read(COMPANY_A)).toBeUndefined()
    expect(axleChargeGapCache.read(COMPANY_B)).toBeUndefined()
  })
})
