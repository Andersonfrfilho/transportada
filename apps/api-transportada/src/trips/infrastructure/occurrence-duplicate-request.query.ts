/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: a trava de pedido repetido, dentro da transação do registro. "Mesma nota" é a NF-e (`nfe_document_id`),
 * não o vínculo com a viagem: a nota que volta numa viagem nova continua com o pedido em aberto. A trava advisory por
 * empresa, nota e tipo serializa dois registros simultâneos (o segundo lê o primeiro já gravado). A política é lida do
 * tipo na hora, não do payload.
 */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'

import { occurrenceContractorReplies } from '../../database/occurrence-contractor-reply.schema.js'
import { tripOccurrenceResolutionEvents } from '../../database/occurrence-conversation.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/trip.schema.js'
import { findBlockingDuplicateRequest } from '../domain/occurrence-duplicate-request.policy.js'
import { OccurrenceDuplicateRequestError } from '../domain/trip.error.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** Recusa com `OccurrenceDuplicateRequestError` (id da ocorrência que já existe) quando o tipo não aceita o repetido. */
export async function assertNoDuplicateOccurrenceRequest(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly tripDocumentId: string
  },
): Promise<void> {
  const [type] = await queryable
    .select({ policy: companyOccurrenceTypes.duplicateRequestPolicy })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, input.companyId),
        eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
      ),
    )
    .limit(1)
  if (type === undefined || type.policy === 'allow') return

  const [link] = await queryable
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.tripDocumentId)),
    )
    .limit(1)
  const noteKey = link?.nfeDocumentId ?? input.tripDocumentId
  await queryable.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`occurrence-duplicate-request:${input.companyId}:${noteKey}:${input.occurrenceTypeId}`}, 0))`,
  )

  const sameNote =
    link?.nfeDocumentId === null || link?.nfeDocumentId === undefined
      ? eq(tripDocumentOccurrences.tripDocumentId, input.tripDocumentId)
      : or(
          eq(tripDocumentOccurrences.tripDocumentId, input.tripDocumentId),
          eq(tripDocuments.nfeDocumentId, link.nfeDocumentId),
        )
  const candidates = await queryable
    .select({
      id: tripDocumentOccurrences.id,
      lastResolutionKind: sql<null | string>`(
        select ${tripOccurrenceResolutionEvents.kind}
        from ${tripOccurrenceResolutionEvents}
        where ${tripOccurrenceResolutionEvents.companyId} = ${tripDocumentOccurrences.companyId}
          and ${tripOccurrenceResolutionEvents.documentOccurrenceId} = ${tripDocumentOccurrences.id}
        order by ${tripOccurrenceResolutionEvents.sequence} desc
        limit 1
      )`,
      replyStatus: occurrenceContractorReplies.status,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .leftJoin(
      occurrenceContractorReplies,
      and(
        eq(occurrenceContractorReplies.companyId, tripDocumentOccurrences.companyId),
        eq(occurrenceContractorReplies.occurrenceId, tripDocumentOccurrences.id),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.occurrenceTypeId, input.occurrenceTypeId),
        isNull(tripDocumentOccurrences.cancelledAt),
        sameNote,
      ),
    )
    .orderBy(desc(tripDocumentOccurrences.createdAt), desc(tripDocumentOccurrences.id))

  const blocking = findBlockingDuplicateRequest(
    type.policy,
    candidates.map((candidate) => ({
      id: candidate.id,
      replyStatus: candidate.replyStatus,
      resolutionState: candidate.lastResolutionKind === 'resolved' ? 'resolved' : 'open',
    })),
  )
  if (blocking !== null) throw new OccurrenceDuplicateRequestError(blocking.id)
}
