/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O catálogo inteiro, ordenado pela D1 da spec 154: primeiro as praças que a operação já cruzou e
 * estão sem tarifa por eixo conhecida, depois as cruzadas com tarifa, depois o resto do catálogo.
 * Ordenar depois de paginar ordenaria só a página — por isso a página é fatiada sobre a
 * concatenação `[vistas ordenadas] ++ [resto paginado no SQL]`, nunca o inverso.
 *
 * As vistas são um conjunto pequeno (spec 090/095): lidas inteiras, sem teto de página, e resolvidas
 * pela política em memória. O resto do catálogo continua pesado (592 em staging e crescendo) e
 * nunca é lido além da fatia que a página pede (RNF2).
 *
 * T202b (decisão de 2026-09-17): o resumo do RF2 ("sem tarifa por eixo conhecida") é pendência da
 * empresa do contexto, não do catálogo cru — `readCatalogAxleCharges` (colunas mínimas, catálogo
 * inteiro) e `charges.loadAdjustments` (ajustes da empresa) entram crus, e
 * `countBoothsWithoutKnownAxleCharge` resolve em memória, nunca em SQL.
 */
import type { TollBoothChargePort } from '../../companies/application/toll-booth-charge.port.js'
import { countBoothsWithoutKnownAxleCharge } from '../domain/toll-booth-axle-charge-gap.policy.js'
import {
  orderSeenRowsByChargeKnown,
  toEntryView,
  type TollBoothCatalogEntryView,
} from '../domain/toll-booth-catalog-entry.policy.js'
import {
  resolveTollCatalogStatus,
  type TollCatalogStatus,
} from '../domain/toll-catalog-status.policy.js'
import {
  TOLL_BOOTH_CATALOG_DEFAULT_PAGE,
  TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE,
  TOLL_BOOTH_CATALOG_MAX_PER_PAGE,
} from './toll-booth-catalog.constant.js'
import type { TollBoothCatalogPort } from './toll-booth-catalog.port.js'
import { resolveSeenRows } from './list-toll-booth-catalog-seen-rows.service.js'
import type { TollBoothSightingPort } from './toll-booth-sighting.port.js'

export type { TollBoothCatalogEntryView } from '../domain/toll-booth-catalog-entry.policy.js'

export type TollBoothCatalogSummaryView = Readonly<{
  boothCount: number
  boothsWithoutAxleChargeCount: number
  observedOn: null | string
  status: TollCatalogStatus
}>

export type ListTollBoothCatalogInput = Readonly<{
  companyId: string
  page?: number
  perPage?: number
  search?: string
}>

export type ListTollBoothCatalogResult = Readonly<{
  page: number
  perPage: number
  rows: readonly TollBoothCatalogEntryView[]
  summary: TollBoothCatalogSummaryView
  total: number
}>

type CatalogSummarySource = Readonly<{
  readCatalogSummary(): Promise<Readonly<{ boothCount: number; latestObservedOn: null | string }>>
}>

export function createListTollBoothCatalogUseCase(dependencies: {
  readonly catalog: TollBoothCatalogPort
  readonly catalogSummary: CatalogSummarySource
  readonly charges: TollBoothChargePort
  readonly clock: { now(): Date }
  readonly sightings: TollBoothSightingPort
}): {
  readonly execute: (input: ListTollBoothCatalogInput) => Promise<ListTollBoothCatalogResult>
} {
  return {
    async execute(input: ListTollBoothCatalogInput): Promise<ListTollBoothCatalogResult> {
      const page = Math.max(input.page ?? TOLL_BOOTH_CATALOG_DEFAULT_PAGE, 1)
      const perPage = Math.min(
        Math.max(input.perPage ?? TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE, 1),
        TOLL_BOOTH_CATALOG_MAX_PER_PAGE,
      )
      const searchTerm = input.search?.trim() || undefined

      const [seenOsmNodeIds, catalogSummary, catalogAxleCharges, companyAdjustments] =
        await Promise.all([
          dependencies.sightings.readSeenOsmNodeIds({ companyId: input.companyId }),
          dependencies.catalogSummary.readCatalogSummary(),
          dependencies.catalog.readCatalogAxleCharges(),
          dependencies.charges.loadAdjustments({ companyId: input.companyId }),
        ])
      const boothsWithoutAxleChargeCount = countBoothsWithoutKnownAxleCharge({
        adjustments: companyAdjustments,
        catalog: catalogAxleCharges,
      })

      const seenRows = await resolveSeenRows({
        catalog: dependencies.catalog,
        charges: dependencies.charges,
        companyId: input.companyId,
        search: searchTerm,
        seenOsmNodeIds,
      })
      const orderedSeenRows = orderSeenRowsByChargeKnown(seenRows)

      const offset = (page - 1) * perPage
      const seenTotal = orderedSeenRows.length
      const seenPageRows = orderedSeenRows.slice(
        Math.min(offset, seenTotal),
        Math.min(offset + perPage, seenTotal),
      )
      const restOffset = Math.max(0, offset - seenTotal)
      const restLimit = Math.max(perPage - seenPageRows.length, 0)

      const restPage = await dependencies.catalog.listCatalog({
        companyId: input.companyId,
        offset: restOffset,
        perPage: restLimit,
        seenFilter: 'exclude',
        seenOsmNodeIds,
        ...(searchTerm === undefined ? {} : { search: searchTerm }),
      })
      const restRows = restPage.rows.map((row) =>
        toEntryView({ adjustment: row.adjustment, catalog: row.catalog, seen: false }),
      )

      const status = resolveTollCatalogStatus({
        summary: catalogSummary,
        today: dependencies.clock.now(),
      })

      return {
        page,
        perPage,
        rows: [...seenPageRows, ...restRows],
        summary: {
          boothCount: catalogSummary.boothCount,
          boothsWithoutAxleChargeCount,
          observedOn: status.observedOn,
          status: status.status,
        },
        total: seenTotal + restPage.total,
      }
    },
  }
}
