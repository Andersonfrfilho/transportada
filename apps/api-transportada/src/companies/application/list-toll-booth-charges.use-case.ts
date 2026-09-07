/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Lista só as praças que a empresa já corrigiu — nunca o catálogo inteiro (spec 095). O molde é o
 * mesmo de `list-fuel-prices.use-case.ts`, com uma diferença: o combustível sempre responde os seis
 * produtos do catálogo, e aqui não há "todas as praças" para responder sem repetir o achado 3 da
 * revisão da 090 (corrigir praça por onde ninguém passa é trabalho jogado fora).
 */
import type { TollBoothRouteRecord } from '../../toll-booths/application/toll-booth.port.js'
import {
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
}): {
  readonly execute: (request: {
    readonly companyId: string
  }) => Promise<readonly EffectiveTollBoothCharge[]>
} {
  return {
    execute: async ({ companyId }) => {
      const adjustments = await input.charges.loadAdjustments({ companyId })
      if (adjustments.length === 0) return []

      const catalogEntries = await input.catalog.readByNodeIds(
        adjustments.map((adjustment) => adjustment.osmNodeId),
      )
      const catalogByNode = new Map(catalogEntries.map((entry) => [entry.osmNodeId, entry]))

      const resolved: EffectiveTollBoothCharge[] = []
      for (const adjustment of adjustments) {
        const catalog = catalogByNode.get(adjustment.osmNodeId)
        /** A FK garante a praça no catálogo; a ausência aqui só existiria com dado inconsistente. */
        if (catalog === undefined) continue
        resolved.push(resolveEffectiveTollBoothCharge({ adjustment, catalog }))
      }
      return resolved
    },
  }
}
