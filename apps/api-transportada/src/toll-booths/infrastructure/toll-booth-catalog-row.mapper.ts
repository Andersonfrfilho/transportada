/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Mapeia a linha crua do join `toll_booths LEFT JOIN company_toll_booth_charges` (spec 154, plano
 * item 4) para `TollBoothCatalogRow` — extraído de `drizzle-toll-booth-catalog.repository.ts`
 * (code-standart §"File Organization", T402 item 5), no molde de `osm-toll-booth.mapper.ts`.
 */
import { and, type SQL } from 'drizzle-orm'

import type { TollBoothChargeAdjustmentRow } from '../../companies/domain/toll-booth-charge.policy.js'
import type { TollBoothCatalogRow } from '../application/toll-booth-catalog.port.js'

export function combineConditions(conditions: readonly (SQL | undefined)[]): SQL | undefined {
  const defined = conditions.filter((condition): condition is SQL => condition !== undefined)
  if (defined.length === 0) return undefined
  if (defined.length === 1) return defined[0]
  return and(...defined)
}

export type CatalogJoinRow = Readonly<{
  adjustmentActorUserId: string | null
  adjustmentChargeCar: string | null
  adjustmentChargePerAxle: string | null
  adjustmentChargePerAxleAutomatic: string | null
  adjustmentObservedOn: string | null
  adjustmentUpdatedAt: Date | null
  catalogChargeCar: string | null
  catalogChargePerAxle: string | null
  catalogChargePerAxleAutomatic: string | null
  catalogName: string | null
  catalogObservedOn: string
  catalogOperator: string | null
  osmNodeId: bigint
}>

export function toRow(row: CatalogJoinRow, seenIds: ReadonlySet<number>): TollBoothCatalogRow {
  const osmNodeId = Number(row.osmNodeId)

  return {
    adjustment: toAdjustment(row, osmNodeId),
    catalog: {
      chargeCar: row.catalogChargeCar,
      chargePerAxle: row.catalogChargePerAxle,
      chargePerAxleAutomatic: row.catalogChargePerAxleAutomatic,
      name: row.catalogName,
      observedOn: row.catalogObservedOn,
      operator: row.catalogOperator,
      osmNodeId,
    },
    osmNodeId,
    seen: seenIds.has(osmNodeId),
  }
}

/**
 * `actorUserId`, `observedOn` e `updatedAt` são gravados juntos, na mesma linha de ajuste — nulo
 * num é o marcador de "sem ajuste aqui" (join sem correspondência), nunca um dos três sozinho.
 * Checar os três explicitamente (spec 154 T503, defeito 10) em vez de `as Date` deixa esse
 * invariante visível no código, no lugar de presumido.
 */
function toAdjustment(row: CatalogJoinRow, osmNodeId: number): TollBoothChargeAdjustmentRow | null {
  if (
    row.adjustmentActorUserId === null ||
    row.adjustmentObservedOn === null ||
    row.adjustmentUpdatedAt === null
  )
    return null

  return {
    actorUserId: row.adjustmentActorUserId,
    chargeCar: row.adjustmentChargeCar,
    chargePerAxle: row.adjustmentChargePerAxle,
    chargePerAxleAutomatic: row.adjustmentChargePerAxleAutomatic,
    observedOn: row.adjustmentObservedOn,
    osmNodeId,
    updatedAt: row.adjustmentUpdatedAt,
  }
}
