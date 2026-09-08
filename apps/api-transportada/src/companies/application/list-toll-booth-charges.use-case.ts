/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Lista as praças que a operação já viu — nunca o catálogo inteiro (spec 095 item 4). "Viu" é ter
 * aparecido no pedágio congelado de alguma viagem (spec 090 T11), lido por `TollBoothSightingPort`.
 * Corrigir praça por onde ninguém passa é trabalho jogado fora, e é por isso que uma praça
 * corrigida no passado mas nunca vista some da lista se nenhuma viagem a tiver cruzado ainda — o
 * ajuste continua no banco, valendo assim que a primeira viagem passar por ela.
 */
import type { TollBoothSightingPort } from '../../toll-booths/application/toll-booth-sighting.port.js'
import type { TollBoothRouteRecord } from '../../toll-booths/application/toll-booth.port.js'
import {
  orderTollBoothChargesByUnknownFirst,
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
} from '../domain/toll-booth-charge.policy.js'
import type { TollBoothChargePort } from './toll-booth-charge.port.js'

export type TollBoothCatalogLookupPort = Readonly<{
  readByNodeIds: (nodeIds: readonly number[]) => Promise<readonly TollBoothRouteRecord[]>
}>

export function createListTollBoothChargesUseCase(input: {
  readonly catalog: TollBoothCatalogLookupPort
  readonly charges: TollBoothChargePort
  readonly sightings: TollBoothSightingPort
}): {
  readonly execute: (request: {
    readonly companyId: string
  }) => Promise<readonly EffectiveTollBoothCharge[]>
} {
  return {
    execute: async ({ companyId }) => {
      const osmNodeIds = await input.sightings.readSeenOsmNodeIds({ companyId })
      if (osmNodeIds.length === 0) return []

      const [catalogEntries, adjustments] = await Promise.all([
        input.catalog.readByNodeIds(osmNodeIds),
        input.charges.loadAdjustmentsByNodeIds({ companyId, osmNodeIds }),
      ])
      const adjustmentByNode = new Map(adjustments.map((row) => [row.osmNodeId, row]))

      const resolved: EffectiveTollBoothCharge[] = []
      for (const catalog of catalogEntries) {
        resolved.push(
          resolveEffectiveTollBoothCharge({
            adjustment: adjustmentByNode.get(catalog.osmNodeId) ?? null,
            catalog,
          }),
        )
      }
      return orderTollBoothChargesByUnknownFirst(resolved)
    },
  }
}
