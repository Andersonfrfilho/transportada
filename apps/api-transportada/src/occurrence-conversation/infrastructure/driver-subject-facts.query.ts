/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4: o que a lista precisa saber do assunto de cada conversa da página — rótulo, ícone do
 * tipo, nota liberada, estado da viagem — em **no máximo quatro buscas em lote** (`inArray`), uma por
 * origem, nunca uma por conversa. Tudo pela empresa, em cada junção.
 */
import { and, eq, inArray } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  nfeDocuments,
  nfeParticipants,
  tripDocumentOccurrences,
  tripDocuments,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../database/database.schema.js'
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { SubjectLabelFacts } from '../domain/conversation-subject-label.policy.js'

const RECIPIENT_PARTICIPANT_ROLE = 'recipient'

export type SubjectFacts = {
  readonly documentReleasedAt: Date | null
  readonly iconName: null | string
  readonly labelFacts: SubjectLabelFacts
  readonly tripStatus: TripStatus | null
}

export type SubjectFactsIds = {
  readonly documentLinkIds: readonly string[]
  readonly documentOccurrenceIds: readonly string[]
  readonly stopOccurrenceIds: readonly string[]
  readonly tripIds: readonly string[]
}

export type SubjectFactsMaps = {
  readonly documents: ReadonlyMap<string, SubjectFacts>
  readonly documentOccurrences: ReadonlyMap<string, SubjectFacts>
  readonly stopOccurrences: ReadonlyMap<string, SubjectFacts>
  readonly trips: ReadonlyMap<string, SubjectFacts>
}

const NO_FACTS = new Map<string, SubjectFacts>()

async function readStopOccurrences(
  queryable: TripQueryable,
  companyId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, SubjectFacts>> {
  if (ids.length === 0) return NO_FACTS
  const rows = await queryable
    .select({
      iconName: companyOccurrenceTypes.iconName,
      id: tripStopOccurrences.id,
      kind: tripStopOccurrences.kind,
      sequence: tripStops.sequence,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripStopOccurrences)
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripStopOccurrences.companyId),
        eq(tripStops.id, tripStopOccurrences.stopId),
      ),
    )
    .leftJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripStopOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripStopOccurrences.occurrenceTypeId),
      ),
    )
    .where(
      and(eq(tripStopOccurrences.companyId, companyId), inArray(tripStopOccurrences.id, [...ids])),
    )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        documentReleasedAt: null,
        iconName: row.iconName,
        labelFacts: {
          invoiceNumber: null,
          stopSequence: Number(row.sequence),
          subjectType: 'occurrence',
          typeName: row.typeName ?? row.kind,
        },
        tripStatus: null,
      },
    ]),
  )
}

async function readDocumentOccurrences(
  queryable: TripQueryable,
  companyId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, SubjectFacts>> {
  if (ids.length === 0) return NO_FACTS
  const rows = await queryable
    .select({
      iconName: companyOccurrenceTypes.iconName,
      id: tripDocumentOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, companyId),
        inArray(tripDocumentOccurrences.id, [...ids]),
      ),
    )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        documentReleasedAt: null,
        iconName: row.iconName,
        labelFacts: {
          invoiceNumber: row.invoiceNumber,
          stopSequence: null,
          subjectType: 'occurrence',
          typeName: row.typeName,
        },
        tripStatus: null,
      },
    ]),
  )
}

async function readDocuments(
  queryable: TripQueryable,
  companyId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, SubjectFacts>> {
  if (ids.length === 0) return NO_FACTS
  const rows = await queryable
    .select({
      id: tripDocuments.id,
      invoiceNumber: nfeDocuments.number,
      legalName: nfeParticipants.legalName,
      releasedAt: tripDocuments.releasedAt,
      tradeName: nfeParticipants.tradeName,
      tripStatus: trips.status,
    })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
      ),
    )
    .where(and(eq(tripDocuments.companyId, companyId), inArray(tripDocuments.id, [...ids])))
  return new Map(
    rows.map((row) => [
      row.id,
      {
        documentReleasedAt: row.releasedAt,
        iconName: null,
        labelFacts: {
          invoiceNumber: row.invoiceNumber ?? '',
          recipientName: row.tradeName ?? row.legalName,
          subjectType: 'document',
        },
        tripStatus: row.tripStatus,
      },
    ]),
  )
}

async function readTrips(
  queryable: TripQueryable,
  companyId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, SubjectFacts>> {
  if (ids.length === 0) return NO_FACTS
  const rows = await queryable
    .select({
      createdAt: trips.createdAt,
      departureAt: trips.etaDepartureAt,
      id: trips.id,
      status: trips.status,
    })
    .from(trips)
    .where(and(eq(trips.companyId, companyId), inArray(trips.id, [...ids])))
  return new Map(
    rows.map((row) => [
      row.id,
      {
        documentReleasedAt: null,
        iconName: null,
        labelFacts: {
          referenceDate: row.departureAt ?? row.createdAt,
          subjectType: 'trip',
        },
        tripStatus: row.status,
      },
    ]),
  )
}

/** As quatro buscas correm em sequência: dentro da transação, a conexão é uma só. */
export async function readSubjectFacts(
  queryable: TripQueryable,
  input: { readonly companyId: string } & SubjectFactsIds,
): Promise<SubjectFactsMaps> {
  return {
    documentOccurrences: await readDocumentOccurrences(
      queryable,
      input.companyId,
      input.documentOccurrenceIds,
    ),
    documents: await readDocuments(queryable, input.companyId, input.documentLinkIds),
    stopOccurrences: await readStopOccurrences(queryable, input.companyId, input.stopOccurrenceIds),
    trips: await readTrips(queryable, input.companyId, input.tripIds),
  }
}
