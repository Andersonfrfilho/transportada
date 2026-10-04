/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF5: o que o tipo ATUAL diz sobre itens, lido em lote para a página inteira — uma
 * consulta, nunca uma por linha. `trip_document_occurrences.occurrence_type_id` não tem FK, então a
 * junção por `(company_id, id)` é a única barreira: tipo de outra empresa nunca entra.
 */
import { and, eq, inArray } from 'drizzle-orm'

import type { DeliveryProofFieldMode } from '../../database/company-delivery-proof-settings.schema.js'
import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type OccurrenceTypeItemsShape = {
  readonly allowsMultipleItems: boolean
  readonly itemsMode: DeliveryProofFieldMode
}

/** O que as leituras de ocorrência publicam; `null` nos três quando não há tipo (parada). */
export type OccurrenceTypeItemsView = {
  readonly occurrenceTypeId: null | string
  readonly typeAllowsMultipleItems: boolean | null
  readonly typeItemsMode: DeliveryProofFieldMode | null
}

export type ListOccurrenceTypeItemsShapesParams = {
  readonly companyId: string
  readonly occurrenceTypeIds: readonly string[]
}

export async function listOccurrenceTypeItemsShapesByIds(
  queryable: TripQueryable,
  params: ListOccurrenceTypeItemsShapesParams,
): Promise<Map<string, OccurrenceTypeItemsShape>> {
  const shapes = new Map<string, OccurrenceTypeItemsShape>()
  if (params.occurrenceTypeIds.length === 0) return shapes

  const rows = await queryable
    .select({
      allowsMultipleItems: companyOccurrenceTypes.allowsMultipleItems,
      id: companyOccurrenceTypes.id,
      itemsMode: companyOccurrenceTypes.itemsMode,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        inArray(companyOccurrenceTypes.id, [...new Set(params.occurrenceTypeIds)]),
      ),
    )

  for (const row of rows) {
    shapes.set(row.id, { allowsMultipleItems: row.allowsMultipleItems, itemsMode: row.itemsMode })
  }
  return shapes
}

export function buildOccurrenceTypeItemsView(params: {
  readonly occurrenceTypeId: null | string
  readonly shapes: ReadonlyMap<string, OccurrenceTypeItemsShape>
}): OccurrenceTypeItemsView {
  const shape =
    params.occurrenceTypeId === null ? undefined : params.shapes.get(params.occurrenceTypeId)
  return {
    occurrenceTypeId: params.occurrenceTypeId,
    typeAllowsMultipleItems: shape?.allowsMultipleItems ?? null,
    typeItemsMode: shape?.itemsMode ?? null,
  }
}
