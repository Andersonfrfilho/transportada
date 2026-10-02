/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225: reparte o custo que a viagem já calculou entre as notas dela. Não recalcula nada — o
 * total não se move, só se divide, e um contrato prende a invariante (D4).
 */
import { APPORTIONMENT_BASES } from './document-cost-apportionment.types.js'
import type {
  ApportionDocumentCostsParams,
  ApportionDocumentCostsResult,
  CostKindApportionment,
} from './document-cost-apportionment.types.js'

/**
 * Spec 225 D1. `Record<TripCostKind, …>` obriga o compilador a cobrar parcela nova — e o contrato
 * cobra o **valor** de cada uma, porque classificar errado compila igual.
 */
export const COST_KIND_APPORTIONMENT: CostKindApportionment = {
  delivery_charges: APPORTIONMENT_BASES.distance,
  driver: APPORTIONMENT_BASES.time,
  fuel: APPORTIONMENT_BASES.distance,
  helper: APPORTIONMENT_BASES.time,
  icms: APPORTIONMENT_BASES.revenue,
  manual: APPORTIONMENT_BASES.tripShare,
  other_per_kilometer: APPORTIONMENT_BASES.distance,
  pis_cofins: APPORTIONMENT_BASES.revenue,
  toll: APPORTIONMENT_BASES.distance,
}

export function apportionDocumentCosts(
  params: ApportionDocumentCostsParams,
): ApportionDocumentCostsResult {
  throw new Error(
    `225 T1.2: apportionDocumentCosts ainda não foi implementada (${params.documents.length} notas)`,
  )
}
