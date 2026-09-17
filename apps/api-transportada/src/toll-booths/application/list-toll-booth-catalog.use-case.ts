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
 */
import {
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
} from '../../companies/domain/toll-booth-charge.policy.js'
import type { TollBoothChargePort } from '../../companies/application/toll-booth-charge.port.js'
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
import type { TollBoothSightingPort } from './toll-booth-sighting.port.js'

export type TollBoothCatalogEntryView = EffectiveTollBoothCharge & Readonly<{ seen: boolean }>

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

      const [seenOsmNodeIds, catalogSummary, boothsWithoutAxleChargeCount] = await Promise.all([
        dependencies.sightings.readSeenOsmNodeIds({ companyId: input.companyId }),
        dependencies.catalogSummary.readCatalogSummary(),
        dependencies.catalog.readAxleChargeGapCount(),
      ])

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

async function resolveSeenRows(dependencies: {
  readonly catalog: TollBoothCatalogPort
  readonly charges: TollBoothChargePort
  readonly companyId: string
  readonly search: string | undefined
  readonly seenOsmNodeIds: readonly number[]
}): Promise<readonly TollBoothCatalogEntryView[]> {
  if (dependencies.seenOsmNodeIds.length === 0) return []

  const [seenCatalogPage, seenAdjustments] = await Promise.all([
    dependencies.catalog.listCatalog({
      companyId: dependencies.companyId,
      seenFilter: 'only',
      seenOsmNodeIds: dependencies.seenOsmNodeIds,
      ...(dependencies.search === undefined ? {} : { search: dependencies.search }),
    }),
    dependencies.charges.loadAdjustmentsByNodeIds({
      companyId: dependencies.companyId,
      osmNodeIds: dependencies.seenOsmNodeIds,
    }),
  ])

  const seenCatalogRows = seenCatalogPage.rows.map((row) =>
    toEntryView({ adjustment: row.adjustment, catalog: row.catalog, seen: true }),
  )

  /**
   * ⚠️ Ajuste de praça vista que o catálogo não conhece mais (`catalogKnown: false`, spec 154 D1)
   * não tem nome nem operador — uma busca por texto nunca o alcançaria de qualquer forma, e por
   * isso ele só entra quando não há termo de busca (`list-toll-booth-charges.use-case.ts` tem a
   * mesma lacuna, resolvida do mesmo jeito).
   */
  if (dependencies.search !== undefined) return seenCatalogRows

  const catalogKnownIds = new Set(seenCatalogRows.map((row) => row.osmNodeId))
  const orphanRows = seenAdjustments
    .filter((adjustment) => !catalogKnownIds.has(adjustment.osmNodeId))
    .map((adjustment) => ({
      ...resolveEffectiveTollBoothCharge({
        adjustment,
        catalog: {
          chargeCar: null,
          chargePerAxle: null,
          chargePerAxleAutomatic: null,
          name: null,
          observedOn: adjustment.observedOn,
          operator: null,
          osmNodeId: adjustment.osmNodeId,
        },
      }),
      catalogKnown: false,
      seen: true,
    }))

  return [...seenCatalogRows, ...orphanRows]
}

function toEntryView(input: {
  readonly adjustment: Parameters<typeof resolveEffectiveTollBoothCharge>[0]['adjustment']
  readonly catalog: Parameters<typeof resolveEffectiveTollBoothCharge>[0]['catalog']
  readonly seen: boolean
}): TollBoothCatalogEntryView {
  return {
    ...resolveEffectiveTollBoothCharge({ adjustment: input.adjustment, catalog: input.catalog }),
    seen: input.seen,
  }
}

/** Vistas sem tarifa por eixo primeiro, depois vistas com tarifa; desempate por `osmNodeId` (D1). */
function orderSeenRowsByChargeKnown(
  rows: readonly TollBoothCatalogEntryView[],
): readonly TollBoothCatalogEntryView[] {
  return [...rows].sort((left, right) => {
    const priorityDelta = seenPriorityOf(left) - seenPriorityOf(right)
    if (priorityDelta !== 0) return priorityDelta
    return left.osmNodeId - right.osmNodeId
  })
}

function seenPriorityOf(row: TollBoothCatalogEntryView): number {
  return row.effectiveChargePerAxle === null ? 0 : 1
}
