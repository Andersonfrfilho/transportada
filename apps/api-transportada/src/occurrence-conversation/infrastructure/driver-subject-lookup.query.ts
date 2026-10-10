/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (ADR-0101 §3): achar um assunto pela ótica do motorista — existe na empresa, a ficha dele
 * está na tripulação da viagem, ele é (ou não) o principal agora — e a conversa do assunto, se já existe.
 * `occurrence` segue a regra de hoje: o leitor do feed e a conversa do próprio usuário.
 */
import { and, eq } from 'drizzle-orm'

import {
  occurrenceConversations,
  tripDocuments,
  tripDrivers,
  trips,
} from '../../database/database.schema.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { TripStatus } from '../../database/trip.schema.js'
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { MyConversationSubject } from '../application/driver-conversation-subject.port.js'

const PRINCIPAL_POSITION = 1n

type ResolvedSubject = {
  readonly documentReleasedAt: Date | null
  readonly occurrenceKind: OccurrenceConversationKind | null
  readonly tripId: string
  readonly tripStatus: TripStatus | null
}

type SubjectKey = {
  readonly companyId: string
  readonly subjectId: string
  readonly subjectType: OccurrenceConversationSubjectType
}

async function resolveSubject(
  queryable: TripQueryable,
  input: SubjectKey,
): Promise<ResolvedSubject | null> {
  if (input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE) {
    const item = await findTripOccurrenceFeedItem(queryable, {
      companyId: input.companyId,
      occurrenceId: input.subjectId,
    })
    if (item === null) return null
    return {
      documentReleasedAt: null,
      occurrenceKind: item.source,
      tripId: item.tripId,
      tripStatus: null,
    }
  }
  if (input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT) {
    const [link] = await queryable
      .select({ releasedAt: tripDocuments.releasedAt, status: trips.status, tripId: trips.id })
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.subjectId)),
      )
      .limit(1)
    if (link === undefined) return null
    return {
      documentReleasedAt: link.releasedAt,
      occurrenceKind: null,
      tripId: link.tripId,
      tripStatus: link.status,
    }
  }
  const [trip] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.subjectId)))
    .limit(1)
  if (trip === undefined) return null
  return {
    documentReleasedAt: null,
    occurrenceKind: null,
    tripId: input.subjectId,
    tripStatus: trip.status,
  }
}

function conversationOf(
  input: SubjectKey & { readonly driverUserId: string },
  resolved: ResolvedSubject,
) {
  const driver = eq(occurrenceConversations.participant, 'driver')
  const company = eq(occurrenceConversations.companyId, input.companyId)
  const subject = eq(occurrenceConversations.subjectType, input.subjectType)
  if (input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT) {
    return and(
      company,
      driver,
      subject,
      eq(occurrenceConversations.tripDocumentId, input.subjectId),
    )
  }
  if (input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.TRIP) {
    return and(company, driver, subject, eq(occurrenceConversations.tripId, input.subjectId))
  }
  return and(
    company,
    driver,
    subject,
    eq(occurrenceConversations.occurrenceId, input.subjectId),
    eq(occurrenceConversations.driverUserId, input.driverUserId),
    ...(resolved.occurrenceKind === null
      ? []
      : [eq(occurrenceConversations.occurrenceKind, resolved.occurrenceKind)]),
  )
}

/** A conversa de nota ou de viagem do assunto, qualquer que seja o destinatário (o BOLA decide depois). */
export async function findSubjectConversationRow(
  queryable: TripQueryable,
  input: SubjectKey & { readonly driverUserId: string },
  resolved: ResolvedSubject,
) {
  const [conversation] = await queryable
    .select({
      driverUserId: occurrenceConversations.driverUserId,
      id: occurrenceConversations.id,
      status: occurrenceConversations.status,
    })
    .from(occurrenceConversations)
    .where(conversationOf(input, resolved))
    .limit(1)
  return conversation === undefined || conversation.driverUserId === null
    ? null
    : {
        driverUserId: conversation.driverUserId,
        id: conversation.id,
        storedStatus: conversation.status,
      }
}

export async function findMySubjectByIdentity(
  queryable: TripQueryable,
  input: SubjectKey & { readonly driverId: string; readonly driverUserId: string },
): Promise<MyConversationSubject | null> {
  const resolved = await resolveSubject(queryable, input)
  if (resolved === null) return null
  const [crew] = await queryable
    .select({ position: tripDrivers.position })
    .from(tripDrivers)
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        eq(tripDrivers.tripId, resolved.tripId),
        eq(tripDrivers.driverId, input.driverId),
      ),
    )
    .limit(1)
  if (crew === undefined) return null
  return {
    conversation: await findSubjectConversationRow(queryable, input, resolved),
    documentReleasedAt: resolved.documentReleasedAt,
    isPrincipal: crew.position === PRINCIPAL_POSITION,
    occurrenceKind: resolved.occurrenceKind,
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    tripId: resolved.tripId,
    tripStatus: resolved.tripStatus,
  }
}
