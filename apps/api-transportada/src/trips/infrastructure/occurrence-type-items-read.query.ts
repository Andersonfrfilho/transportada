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
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
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

export const OCCURRENCE_TYPE_ITEMS_READ_FAILED_MESSAGE = 'occurrence_type_items_read_failed'

const UNKNOWN_FAILURE_CODE = 'unknown'

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

/** SQLSTATE do Postgres: o `DrizzleQueryError` o carrega na causa, e a mensagem dele traz os parâmetros. */
function readFailureCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  for (const candidate of [cause, error]) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const code: unknown = Reflect.get(candidate, 'code')
    if (typeof code === 'string') return code
  }
  return UNKNOWN_FAILURE_CODE
}

/**
 * ⚠️ É refinamento: o painel tolera os campos ausentes (`null`), então a falha desta leitura vira
 * mapa vazio — registrada, sem parâmetro nem dado — em vez de derrubar a lista que já funcionava sem
 * ela (`Promise.all` rejeita no primeiro erro e descarta o resto do lote).
 * Sem `logger` a falha propaga: dentro de transação o `.catch` esconderia a causa e o próximo
 * comando morreria com `25P02`.
 */
export function listOccurrenceTypeItemsShapesOrEmpty(
  queryable: TripQueryable,
  params: ListOccurrenceTypeItemsShapesParams & { readonly logger?: ApiLogger },
): Promise<Map<string, OccurrenceTypeItemsShape>> {
  const { logger, ...readParams } = params
  const read = listOccurrenceTypeItemsShapesByIds(queryable, readParams)
  if (logger === undefined) return read
  return read.catch((error: unknown) => {
    safeLogWarn({
      logger,
      message: OCCURRENCE_TYPE_ITEMS_READ_FAILED_MESSAGE,
      metadata: { code: readFailureCode(error) },
    })
    return new Map()
  })
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
