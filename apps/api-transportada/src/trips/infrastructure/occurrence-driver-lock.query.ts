/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A trava de motorista do tipo: nas `driver_lock_hours` horas depois de existir a mesma ocorrência do tipo na mesma nota
 * da viagem (feita por ele ou pelo escritório, aberta ou resolvida), o motorista não registra outra — o reenvio da fila
 * offline recebe a que já existe. Escopo é tipo + nota da viagem: a trava de uma nota não alcança as outras. O escritório
 * nunca é travado; usa a mesma consulta só para ser avisado.
 */
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'

import { companyOccurrenceTypes, tripDocumentOccurrences } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type LockingOccurrence = { readonly id: string }

/** A ocorrência mais recente que trava o tipo na nota, ou `null` (tipo sem trava, ou nada na janela). */
export async function findDriverLockingOccurrence(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly occurrenceTypeId: string
  },
): Promise<LockingOccurrence | null> {
  const [type] = await queryable
    .select({ hours: companyOccurrenceTypes.driverLockHours })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, input.companyId),
        eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
      ),
    )
    .limit(1)
  if (type === undefined || type.hours === null) return null

  await queryable.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`occurrence-driver-lock:${input.companyId}:${input.documentId}:${input.occurrenceTypeId}`}, 0))`,
  )
  const [existing] = await queryable
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.tripDocumentId, input.documentId),
        eq(tripDocumentOccurrences.occurrenceTypeId, input.occurrenceTypeId),
        isNull(tripDocumentOccurrences.cancelledAt),
        gte(tripDocumentOccurrences.createdAt, sql`now() - make_interval(hours => ${type.hours})`),
      ),
    )
    .orderBy(desc(tripDocumentOccurrences.createdAt), desc(tripDocumentOccurrences.id))
    .limit(1)
  return existing ?? null
}
