/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: a trava de pedido repetido, dentro da transação do registro. "Mesma nota" é a NF-e (`nfe_document_id`),
 * não o vínculo com a viagem: a nota que volta numa viagem nova continua com o pedido em aberto. A trava advisory por
 * empresa, nota e tipo serializa dois registros simultâneos (o segundo lê o primeiro já gravado). A política é lida do
 * tipo na hora, não do payload.
 *
 * Spec 321 T2 (D6): no tipo com coleta de canhoto a política vale `until_resolved` sempre, a ocorrência está aberta
 * enquanto a coleta está `pending | scheduled`, e qualquer coleta aberta da mesma nota (de outro tipo com coleta, inclusive)
 * também bloqueia. A trava advisory desse tipo é por nota, não por tipo, para dois tipos com coleta não correrem juntos.
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
import {
  effectiveDuplicateRequestPolicy,
  isCanhotoPickupOpen,
} from '../domain/canhoto-pickup.policy.js'
import {
  findOpenCanhotoPickupOccurrenceId,
  readCanhotoPickupStatuses,
} from './canhoto-pickup.query.js'
import { OccurrenceDuplicateRequestError } from '../domain/trip.error.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Recusa com `OccurrenceDuplicateRequestError` (id da ocorrência que já existe) quando o tipo não aceita o repetido.
 * Devolve se o tipo cria coleta de canhoto (spec 321 T2), lido na mesma consulta, para o registro não reler o tipo.
 */
export async function assertNoDuplicateOccurrenceRequest(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly tripDocumentId: string
  },
): Promise<{ readonly createsCanhotoPickup: boolean }> {
  const [type] = await queryable
    .select({
      createsCanhotoPickup: companyOccurrenceTypes.createsCanhotoPickup,
      policy: companyOccurrenceTypes.duplicateRequestPolicy,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, input.companyId),
        eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
      ),
    )
    .limit(1)
  if (type === undefined) return { createsCanhotoPickup: false }
  const { createsCanhotoPickup } = type
  const policy = effectiveDuplicateRequestPolicy({ createsCanhotoPickup, policy: type.policy })
  if (policy === 'allow') return { createsCanhotoPickup }

  const [link] = await queryable
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.tripDocumentId)),
    )
    .limit(1)
  const noteKey = link?.nfeDocumentId ?? input.tripDocumentId
  const lockScope = createsCanhotoPickup ? 'canhoto-pickup' : input.occurrenceTypeId
  await queryable.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`occurrence-duplicate-request:${input.companyId}:${noteKey}:${lockScope}`}, 0))`,
  )

  if (createsCanhotoPickup) {
    const openPickupOccurrenceId = await findOpenCanhotoPickupOccurrenceId(queryable, {
      companyId: input.companyId,
      nfeDocumentId: link?.nfeDocumentId ?? null,
      tripDocumentId: input.tripDocumentId,
    })
    if (openPickupOccurrenceId !== null) {
      throw new OccurrenceDuplicateRequestError(openPickupOccurrenceId)
    }
  }

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

  /** D6: com coleta, o estado é o da coleta; ocorrência sem coleta (anterior à marca) segue o andamento da 266. */
  const pickupStatuses = createsCanhotoPickup
    ? await readCanhotoPickupStatuses(queryable, {
        companyId: input.companyId,
        occurrenceIds: candidates.map((candidate) => candidate.id),
      })
    : new Map()
  const blocking = findBlockingDuplicateRequest(
    policy,
    candidates.map((candidate) => {
      const pickupStatus = pickupStatuses.get(candidate.id)
      const isOpen =
        pickupStatus === undefined
          ? candidate.lastResolutionKind !== 'resolved'
          : isCanhotoPickupOpen(pickupStatus)
      return {
        id: candidate.id,
        replyStatus: candidate.replyStatus,
        resolutionState: isOpen ? ('open' as const) : ('resolved' as const),
      }
    }),
  )
  if (blocking !== null) throw new OccurrenceDuplicateRequestError(blocking.id)
  return { createsCanhotoPickup }
}
