/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Resolve as praças já vistas pela operação (spec 154 D1), inclusive as que o catálogo não conhece
 * mais (`catalogKnown: false`) — extraído de `list-toll-booth-catalog.use-case.ts` (code-standart
 * §"File Organization", T402 item 5). Depende de portas, então fica na aplicação; a ordenação e a
 * forma da linha (puras) moram em `toll-booth-catalog-entry.policy.ts`.
 */
import { resolveEffectiveTollBoothCharge } from '../../companies/domain/toll-booth-charge.policy.js'
import type { TollBoothChargePort } from '../../companies/application/toll-booth-charge.port.js'
import {
  toEntryView,
  type TollBoothCatalogEntryView,
} from '../domain/toll-booth-catalog-entry.policy.js'
import type { TollBoothCatalogPort } from './toll-booth-catalog.port.js'

export async function resolveSeenRows(dependencies: {
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
