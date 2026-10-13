/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF13 (T5.2): o selo do retorno da contratante na listagem de ocorrências — o estado e a contagem
 * de alertas, numa leitura só por página e sempre com `company_id`. Não importa nada de `trips`: a listagem
 * chama este arquivo, e a volta faria o ciclo.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { occurrenceContractorReplies } from '../../database/database.schema.js'
import type { ContractorReplyStatus } from '../../shared/occurrence-contractor-reply.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

export type OccurrenceContractorReplySummary = {
  readonly alertCount: number
  readonly status: ContractorReplyStatus
}

export async function listOccurrenceContractorReplySummaries(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, OccurrenceContractorReplySummary>> {
  if (input.occurrenceIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      alertCount: occurrenceContractorReplies.alertCount,
      occurrenceId: occurrenceContractorReplies.occurrenceId,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, input.companyId),
        inArray(occurrenceContractorReplies.occurrenceId, [...input.occurrenceIds]),
      ),
    )
  return new Map(
    rows.map((row) => [row.occurrenceId, { alertCount: row.alertCount, status: row.status }]),
  )
}
