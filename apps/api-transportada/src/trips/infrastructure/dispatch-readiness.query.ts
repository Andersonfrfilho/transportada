/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 (D1/D3, ADR-0074 §4): o que `resolveDispatchReadiness` precisa saber de cada nota da
 * viagem, numa consulta só — sem N+1 por nota. A nota "fica para trás" quando existe ocorrência de
 * separação **sobre a nota inteira** (`product_code = ''` e nenhum item em
 * `trip_document_occurrence_products`, a mesma definição de `occurrence-scope.policy.ts`) cujo tipo
 * tem `leaves_document_behind` **agora** — vale o tipo no momento do despacho, não o do registro.
 *
 * ⚠️ O tipo não tem FK para a ocorrência: a junção carrega `company_id` em todo degrau, senão o
 * cadastro de outra empresa decidiria o destino da nota desta.
 *
 * "Ocorrência aberta" (ADR-0074 §4, RF1) é a que não tem tratativa em `trip_occurrence_cases` ou
 * cuja tratativa ainda não chegou a um terminal (`OCCURRENCE_CASE_TERMINAL_STATUSES`, a mesma lista
 * de `occurrence-case-marker.query.ts`). O detalhe da viagem lê por esta mesma consulta.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import { OCCURRENCE_CASE_TERMINAL_STATUSES } from '../domain/occurrence-case-state.policy.js'
import type { DispatchReadinessDocument } from '../domain/dispatch-readiness.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** Nota inteira é código vazio — o `productCode` antigo guarda o primeiro item marcado. */
const WHOLE_DOCUMENT_PRODUCT_CODE = ''

export async function readDispatchReadinessDocuments(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly DispatchReadinessDocument[]> {
  const rows = await queryable
    .select({
      leavesBehindOccurrenceTypeName: companyOccurrenceTypes.name,
      releasedAt: tripDocuments.releasedAt,
      separationStatus: tripDocuments.separationStatus,
      tripDocumentId: tripDocuments.id,
    })
    .from(tripDocuments)
    .leftJoin(
      tripDocumentOccurrences,
      and(
        eq(tripDocumentOccurrences.companyId, tripDocuments.companyId),
        eq(tripDocumentOccurrences.tripDocumentId, tripDocuments.id),
        eq(tripDocumentOccurrences.stage, TRIP_OCCURRENCE_STAGE.separation),
        eq(tripDocumentOccurrences.productCode, WHOLE_DOCUMENT_PRODUCT_CODE),
        sql`not exists (
          select 1 from ${tripDocumentOccurrenceProducts}
          where ${tripDocumentOccurrenceProducts.companyId} = ${tripDocumentOccurrences.companyId}
            and ${tripDocumentOccurrenceProducts.occurrenceId} = ${tripDocumentOccurrences.id}
        )`,
        sql`not exists (
          select 1 from ${tripOccurrenceCases}
          where ${tripOccurrenceCases.companyId} = ${tripDocumentOccurrences.companyId}
            and ${tripOccurrenceCases.occurrenceId} = ${tripDocumentOccurrences.id}
            and ${inArray(tripOccurrenceCases.status, [...OCCURRENCE_CASE_TERMINAL_STATUSES])}
        )`,
      ),
    )
    .leftJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
        eq(companyOccurrenceTypes.leavesDocumentBehind, true),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
    )
    .orderBy(
      asc(tripDocuments.id),
      asc(tripDocumentOccurrences.createdAt),
      asc(tripDocumentOccurrences.id),
    )

  // Uma linha por ocorrência: a nota fica com o nome do tipo da primeira que a deixa para trás.
  const documents = new Map<string, DispatchReadinessDocument>()
  for (const row of rows) {
    const known = documents.get(row.tripDocumentId)
    if (known !== undefined && known.leavesBehindOccurrenceTypeName !== null) continue
    documents.set(row.tripDocumentId, {
      isReleased: row.releasedAt !== null,
      leavesBehindOccurrenceTypeName: row.leavesBehindOccurrenceTypeName,
      separationStatus: row.separationStatus,
      tripDocumentId: row.tripDocumentId,
    })
  }

  return [...documents.values()]
}
