/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: escritor e leitor de `trip_occurrence_resolution_events`.
 *
 * ⚠️ **`FOR NO KEY UPDATE` só na linha da ocorrência**, antes de ler o estado — no molde do
 * cancelamento da 167 (`drizzle-occurrence-correction.repository.ts`). Nunca `FOR UPDATE` (deadlocka
 * contra o `FOR KEY SHARE` da FK composta) e nunca no último evento: sem evento não haveria o que
 * travar.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../database/occurrence-conversation.schema.js'
import {
  tripDocumentOccurrences,
  tripOccurrenceCaseEvents,
  tripStopOccurrences,
} from '../../database/trip.schema.js'
import type {
  InsertInternalResolutionInput,
  InsertedResolution,
  LockedOccurrence,
  OccurrenceKind,
  OccurrenceResolutionTransactionPort,
  OccurrenceResolutionUnitOfWork,
  OccurrenceTarget,
} from '../application/occurrence-resolution.port.js'
import type { OccurrenceResolutionEventFact } from '../domain/occurrence-resolution.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type ListLatestResolutionEventsInput = {
  readonly companyId: string
  readonly occurrenceIds: readonly string[]
  readonly occurrenceKind: OccurrenceKind
}

export class DrizzleOccurrenceResolutionUnitOfWork implements OccurrenceResolutionUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: OccurrenceResolutionTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createOccurrenceResolutionTransactionPort(transaction)),
    )
  }
}

function createOccurrenceResolutionTransactionPort(
  queryable: TripQueryable,
): OccurrenceResolutionTransactionPort {
  return {
    insertInternalResolution: (input) => insertInternalResolution(queryable, input),
    listLatestEvents: async (input) =>
      (
        await listLatestResolutionEventsByOccurrence(queryable, {
          companyId: input.companyId,
          occurrenceIds: [input.occurrenceId],
          occurrenceKind: input.occurrenceKind,
        })
      ).get(input.occurrenceId) ?? [],
    lockOccurrence: (input) => lockOccurrenceRow(queryable, input),
  }
}

/** Trava a linha e devolve o que o estado precisa dela. Ocorrência de recebimento (sem viagem) não é desta rota. */
export async function lockOccurrenceRow(
  queryable: TripQueryable,
  input: OccurrenceTarget,
): Promise<LockedOccurrence | undefined> {
  if (input.occurrenceKind === 'stop') {
    const [stopRow] = await queryable
      .select({ id: tripStopOccurrences.id })
      .from(tripStopOccurrences)
      .where(
        and(
          eq(tripStopOccurrences.companyId, input.companyId),
          eq(tripStopOccurrences.id, input.occurrenceId),
        ),
      )
      .for('no key update')
      .limit(1)
    return stopRow === undefined ? undefined : { cancelledAt: undefined }
  }

  const [documentRow] = await queryable
    .select({
      cancelledAt: tripDocumentOccurrences.cancelledAt,
      tripDocumentId: tripDocumentOccurrences.tripDocumentId,
    })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .for('no key update')
    .limit(1)
  if (documentRow === undefined || documentRow.tripDocumentId === null) return undefined
  return { cancelledAt: documentRow.cancelledAt?.toISOString() }
}

async function insertInternalResolution(
  queryable: TripQueryable,
  input: InsertInternalResolutionInput,
): Promise<InsertedResolution> {
  const [inserted] = await queryable
    .insert(tripOccurrenceResolutionEvents)
    .values({
      actorKind: 'internal',
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      documentOccurrenceId: input.occurrenceKind === 'document' ? input.occurrenceId : null,
      kind: 'resolved',
      note: input.note,
      stopOccurrenceId: input.occurrenceKind === 'stop' ? input.occurrenceId : null,
    })
    .returning({ createdAt: tripOccurrenceResolutionEvents.createdAt })
  if (inserted === undefined) throw new Error('OCCURRENCE_RESOLUTION_INSERT_RETURNED_NO_ROW')
  return { createdAt: inserted.createdAt.toISOString() }
}

/**
 * Uma consulta para N ocorrências, sem N+1: o último evento de cada `kind` por ocorrência
 * (`DISTINCT ON`), no máximo dois por ocorrência — o último de todos dá o estado e o último
 * `resolved` dá a resolução exibida.
 */
export async function listLatestResolutionEventsByOccurrence(
  queryable: TripQueryable,
  input: ListLatestResolutionEventsInput,
): Promise<ReadonlyMap<string, readonly OccurrenceResolutionEventFact[]>> {
  const result = new Map<string, OccurrenceResolutionEventFact[]>()
  if (input.occurrenceIds.length === 0) return result

  const ownerColumn =
    input.occurrenceKind === 'document'
      ? tripOccurrenceResolutionEvents.documentOccurrenceId
      : tripOccurrenceResolutionEvents.stopOccurrenceId
  const rows = await queryable
    .selectDistinctOn([ownerColumn, tripOccurrenceResolutionEvents.kind], {
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      caseEventStatus: tripOccurrenceCaseEvents.toStatus,
      createdAt: tripOccurrenceResolutionEvents.createdAt,
      id: tripOccurrenceResolutionEvents.id,
      kind: tripOccurrenceResolutionEvents.kind,
      note: tripOccurrenceResolutionEvents.note,
      occurrenceId: ownerColumn,
    })
    .from(tripOccurrenceResolutionEvents)
    .leftJoin(
      tripOccurrenceCaseEvents,
      and(
        eq(tripOccurrenceCaseEvents.companyId, tripOccurrenceResolutionEvents.companyId),
        eq(tripOccurrenceCaseEvents.id, tripOccurrenceResolutionEvents.caseEventId),
      ),
    )
    .where(
      and(
        eq(tripOccurrenceResolutionEvents.companyId, input.companyId),
        inArray(ownerColumn, [...input.occurrenceIds]),
      ),
    )
    .orderBy(
      ownerColumn,
      tripOccurrenceResolutionEvents.kind,
      desc(tripOccurrenceResolutionEvents.createdAt),
      desc(tripOccurrenceResolutionEvents.id),
    )

  for (const row of rows) {
    if (row.occurrenceId === null) continue
    const facts = result.get(row.occurrenceId) ?? []
    facts.push({
      actorKind: row.actorKind,
      caseEventStatus: row.caseEventStatus ?? undefined,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      kind: row.kind,
      note: row.note ?? undefined,
    })
    result.set(row.occurrenceId, facts)
  }
  return result
}

/** O histórico inteiro de uma ocorrência, para a linha do tempo do detalhe (poucos eventos por ocorrência). */
export async function listAllResolutionEventsByOccurrence(
  queryable: TripQueryable,
  input: ListLatestResolutionEventsInput,
): Promise<ReadonlyMap<string, readonly OccurrenceResolutionEventFact[]>> {
  const result = new Map<string, OccurrenceResolutionEventFact[]>()
  if (input.occurrenceIds.length === 0) return result

  const ownerColumn =
    input.occurrenceKind === 'document'
      ? tripOccurrenceResolutionEvents.documentOccurrenceId
      : tripOccurrenceResolutionEvents.stopOccurrenceId
  const rows = await queryable
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      caseEventStatus: tripOccurrenceCaseEvents.toStatus,
      createdAt: tripOccurrenceResolutionEvents.createdAt,
      id: tripOccurrenceResolutionEvents.id,
      kind: tripOccurrenceResolutionEvents.kind,
      note: tripOccurrenceResolutionEvents.note,
      occurrenceId: ownerColumn,
    })
    .from(tripOccurrenceResolutionEvents)
    .leftJoin(
      tripOccurrenceCaseEvents,
      and(
        eq(tripOccurrenceCaseEvents.companyId, tripOccurrenceResolutionEvents.companyId),
        eq(tripOccurrenceCaseEvents.id, tripOccurrenceResolutionEvents.caseEventId),
      ),
    )
    .where(
      and(
        eq(tripOccurrenceResolutionEvents.companyId, input.companyId),
        inArray(ownerColumn, [...input.occurrenceIds]),
      ),
    )
    .orderBy(tripOccurrenceResolutionEvents.createdAt, tripOccurrenceResolutionEvents.id)

  for (const row of rows) {
    if (row.occurrenceId === null) continue
    const facts = result.get(row.occurrenceId) ?? []
    facts.push({
      actorKind: row.actorKind,
      caseEventStatus: row.caseEventStatus ?? undefined,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      kind: row.kind,
      note: row.note ?? undefined,
    })
    result.set(row.occurrenceId, facts)
  }
  return result
}
