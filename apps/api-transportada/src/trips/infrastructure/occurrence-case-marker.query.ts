/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T15: o marcador derivado na leitura — nunca gravado. `openOccurrenceCase` (RF20) e
 * `hasOpenOccurrence` (RF21) não são coluna nenhuma: uma nota "tem tratativa aberta" quando existe
 * uma linha em `trip_occurrence_cases` para alguma ocorrência dela cujo status ainda não é
 * terminal (`OCCURRENCE_CASE_TERMINAL_STATUSES`). Nada aqui escreve em `trip_documents` ou em
 * `trip_occurrence_cases` — é uma única leitura a mais, batida pelos `tripDocumentId`s que o
 * detalhe já buscou, para caber na mesma consulta fixa que
 * `test/integration/trip-detail-query-count.integration.ts` exige (sem N+1 por parada).
 */
import { and, eq, inArray, notInArray } from 'drizzle-orm'

import { tripDocumentOccurrences, tripOccurrenceCases } from '../../database/trip.schema.js'
import { OCCURRENCE_CASE_TERMINAL_STATUSES } from '../domain/occurrence-case-state.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Devolve o conjunto de `trip_documents.id` com ao menos uma tratativa ainda não terminal. Lista
 * vazia de entrada não paga consulta nenhuma — nenhuma viagem sem nota faz o `select` a mais.
 */
export async function loadTripDocumentIdsWithOpenOccurrenceCase(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly tripDocumentIds: readonly string[]
  },
): Promise<ReadonlySet<string>> {
  if (input.tripDocumentIds.length === 0) return new Set()

  const rows = await queryable
    .selectDistinct({ tripDocumentId: tripDocumentOccurrences.tripDocumentId })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripOccurrenceCases,
      and(
        eq(tripOccurrenceCases.companyId, tripDocumentOccurrences.companyId),
        eq(tripOccurrenceCases.occurrenceId, tripDocumentOccurrences.id),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        inArray(tripDocumentOccurrences.tripDocumentId, [...input.tripDocumentIds]),
        notInArray(tripOccurrenceCases.status, [...OCCURRENCE_CASE_TERMINAL_STATUSES]),
      ),
    )

  return new Set(rows.map((row) => row.tripDocumentId))
}
