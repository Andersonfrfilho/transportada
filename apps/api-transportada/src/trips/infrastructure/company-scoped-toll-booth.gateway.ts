/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O pedágio da viagem não conhece o repositório de ajustes: ele pede as praças de sempre, e é este
 * adaptador que substitui o valor do catálogo pelo ajuste da empresa quando ele existe — a mesma
 * política que a página de correção usa (spec 095 D1). No molde de
 * `fleet/infrastructure/company-fuel-price.gateway.ts`.
 */
import type { TollBoothChargePort } from '../../companies/application/toll-booth-charge.port.js'
import { resolveEffectiveTollBoothCharge } from '../../companies/domain/toll-booth-charge.policy.js'
import type {
  TollBoothRepository,
  TollBoothRouteRecord,
} from '../../toll-booths/application/toll-booth.port.js'
import type { ReadRouteGeometryTollBoothsPort } from '../application/read-route-geometry.use-case.js'

export function createCompanyScopedTollBoothGateway(input: {
  readonly catalog: TollBoothRepository
  readonly charges: TollBoothChargePort
  readonly companyId: string
}): ReadRouteGeometryTollBoothsPort {
  return {
    async readByNodeIds(nodeIds): Promise<readonly TollBoothRouteRecord[]> {
      const [records, adjustments] = await Promise.all([
        input.catalog.readByNodeIds(nodeIds),
        input.charges.loadAdjustmentsByNodeIds({ companyId: input.companyId, osmNodeIds: nodeIds }),
      ])
      if (adjustments.length === 0) return records

      const adjustmentByNode = new Map(adjustments.map((row) => [row.osmNodeId, row]))

      return records.map((record) => {
        const effective = resolveEffectiveTollBoothCharge({
          adjustment: adjustmentByNode.get(record.osmNodeId) ?? null,
          catalog: record,
        })
        return {
          ...record,
          chargeCar: effective.effectiveChargeCar,
          chargePerAxle: effective.effectiveChargePerAxle,
        }
      })
    },
  }
}
