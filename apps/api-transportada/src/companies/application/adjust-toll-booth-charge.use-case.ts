/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Grava a correção de uma praça e devolve como ela ficou — a releitura é o que faz a resposta trazer
 * a tarifa do catálogo ao lado do valor digitado, no molde de `adjust-fuel-price.use-case.ts`.
 */
import { invalidRequest } from '../../http/request-parsing.service.js'
import {
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
} from '../domain/toll-booth-charge.policy.js'
import type { TollBoothCatalogLookupPort } from './list-toll-booth-charges.use-case.js'
import type {
  SaveTollBoothChargeAdjustment,
  TollBoothChargePort,
} from './toll-booth-charge.port.js'

export function createAdjustTollBoothChargeUseCase(input: {
  readonly catalog: TollBoothCatalogLookupPort
  readonly charges: TollBoothChargePort
}): {
  readonly execute: (request: SaveTollBoothChargeAdjustment) => Promise<EffectiveTollBoothCharge>
} {
  return {
    execute: async (request) => {
      await input.charges.saveAdjustment(request)

      const [catalog] = await input.catalog.readByNodeIds([request.osmNodeId])
      /** A FK de `company_toll_booth_charges.osm_node_id` só deixa gravar nó que existe no catálogo. */
      if (catalog === undefined) {
        throw invalidRequest([{ field: 'osmNodeId', message: 'unknown toll booth' }])
      }

      const [adjustment] = await input.charges.loadAdjustmentsByNodeIds({
        companyId: request.companyId,
        osmNodeIds: [request.osmNodeId],
      })

      return resolveEffectiveTollBoothCharge({ adjustment: adjustment ?? null, catalog })
    },
  }
}
