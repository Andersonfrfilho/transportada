/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (ADR-0101 §3–4): achar o assunto pela ótica do escritório — a nota ou a viagem do caminho,
 * na empresa do contexto — e a conversa dele, se já existe; o motorista principal de agora; e gravar o
 * encerramento. Assunto de outra viagem ou empresa devolve `null`, igual ao inexistente.
 */
import { and, eq } from 'drizzle-orm'

import {
  fleetDrivers,
  occurrenceConversations,
  tripDocuments,
  tripDrivers,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  OfficeSubject,
  OfficeSubjectKey,
} from '../application/office-subject-conversation.port.js'
import { readSubjectFacts } from './driver-subject-facts.query.js'

const PRINCIPAL_POSITION = 1n

async function belongsToTrip(queryable: TripQueryable, key: OfficeSubjectKey): Promise<boolean> {
  if (key.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.TRIP) return key.subjectId === key.tripId
  const [link] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, key.companyId),
        eq(tripDocuments.id, key.subjectId),
        eq(tripDocuments.tripId, key.tripId),
      ),
    )
    .limit(1)
  return link !== undefined
}

async function findConversation(queryable: TripQueryable, key: OfficeSubjectKey) {
  const isDocument = key.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT
  const [conversation] = await queryable
    .select({
      driverUserId: occurrenceConversations.driverUserId,
      id: occurrenceConversations.id,
      status: occurrenceConversations.status,
    })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, key.companyId),
        eq(occurrenceConversations.participant, 'driver'),
        eq(occurrenceConversations.subjectType, key.subjectType),
        eq(occurrenceConversations.tripId, key.tripId),
        isDocument ? eq(occurrenceConversations.tripDocumentId, key.subjectId) : undefined,
      ),
    )
    .limit(1)
  if (conversation === undefined || conversation.driverUserId === null) return null
  return {
    driverUserId: conversation.driverUserId,
    id: conversation.id,
    storedStatus: conversation.status,
  }
}

export async function findOfficeSubject(
  queryable: TripQueryable,
  key: OfficeSubjectKey,
): Promise<OfficeSubject | null> {
  if (!(await belongsToTrip(queryable, key))) return null
  const isDocument = key.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT
  const maps = await readSubjectFacts(queryable, {
    companyId: key.companyId,
    documentLinkIds: isDocument ? [key.subjectId] : [],
    documentOccurrenceIds: [],
    stopOccurrenceIds: [],
    tripIds: isDocument ? [] : [key.subjectId],
  })
  const facts = (isDocument ? maps.documents : maps.trips).get(key.subjectId)
  if (facts === undefined) return null
  return {
    conversation: await findConversation(queryable, key),
    documentReleasedAt: facts.documentReleasedAt,
    labelFacts: facts.labelFacts,
    tripStatus: facts.tripStatus,
  }
}

/** O usuário (vínculo ativo) do primeiro condutor — a mesma regra da conversa de ocorrência. */
export async function findPrincipalDriverUserId(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<null | string> {
  const [driver] = await queryable
    .select({ userId: userCompanyMemberships.userId })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        eq(tripDrivers.tripId, input.tripId),
        eq(tripDrivers.position, PRINCIPAL_POSITION),
      ),
    )
    .limit(1)
  return driver?.userId ?? null
}

export async function setConversationStoredStatus(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly conversationId: string
    readonly status: 'closed' | 'open'
  },
): Promise<void> {
  await queryable
    .update(occurrenceConversations)
    .set({ status: input.status, updatedAt: new Date() })
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.id, input.conversationId),
      ),
    )
}
