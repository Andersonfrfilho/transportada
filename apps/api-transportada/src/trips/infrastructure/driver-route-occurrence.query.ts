/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: as ocorrências (nota e parada) de uma viagem e o que as acompanha, **em lote**:
 * uma consulta por tabela, nunca uma por linha. Cada junção leva `company_id`.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/occurrence-conversation.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypes,
  TRIP_FIELD_CHANNELS,
  tripDocumentOccurrences,
  tripDocuments,
  tripFieldReports,
  tripStopOccurrences,
  tripStops,
} from '../../database/trip.schema.js'
import type { OccurrenceKind } from '../application/occurrence-resolution.port.js'
import type { DriverRouteOccurrenceChatAttachmentFact } from '../domain/driver-route-occurrence.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type RouteOccurrenceRow = {
  readonly actorUserId: string
  readonly attachmentObjectId: string | null
  readonly cancelledAt: Date | null
  readonly createdAt: Date
  readonly documentId: string | null
  readonly documentNumber: string | null
  readonly id: string
  readonly kind: OccurrenceKind
  readonly note: string
  readonly signatureObjectId: string | null
  readonly stopId: string
  readonly stopSequence: number
  readonly type: { readonly iconName: string | null; readonly id: string; readonly name: string }
}

type RouteOccurrenceScope = {
  readonly companyId: string
  readonly targetId: string | undefined
  readonly tripId: string
}

export async function listDocumentRouteOccurrenceRows(
  queryable: TripQueryable,
  scope: RouteOccurrenceScope,
): Promise<readonly RouteOccurrenceRow[]> {
  const rows = await queryable
    .select({
      actorUserId: tripDocumentOccurrences.actorUserId,
      attachmentObjectId: tripDocumentOccurrences.attachmentObjectId,
      cancelledAt: tripDocumentOccurrences.cancelledAt,
      createdAt: tripDocumentOccurrences.createdAt,
      documentId: tripDocuments.id,
      documentNumber: nfeDocuments.number,
      iconName: companyOccurrenceTypes.iconName,
      id: tripDocumentOccurrences.id,
      note: tripDocumentOccurrences.note,
      signatureObjectId: tripDocumentOccurrences.signatureObjectId,
      stopId: tripStops.id,
      stopSequence: tripStops.sequence,
      typeId: companyOccurrenceTypes.id,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripDocuments.companyId),
        eq(tripStops.id, tripDocuments.stopId),
        eq(tripStops.tripId, tripDocuments.tripId),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
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
        eq(tripDocumentOccurrences.companyId, scope.companyId),
        eq(tripDocuments.tripId, scope.tripId),
        scope.targetId === undefined ? undefined : eq(tripDocumentOccurrences.id, scope.targetId),
      ),
    )

  return rows.map((row) => ({
    actorUserId: row.actorUserId,
    attachmentObjectId: row.attachmentObjectId,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    id: row.id,
    kind: 'document',
    note: row.note,
    signatureObjectId: row.signatureObjectId,
    stopId: row.stopId,
    stopSequence: Number(row.stopSequence),
    type: { iconName: row.iconName, id: row.typeId, name: row.typeName },
  }))
}

export async function listStopRouteOccurrenceRows(
  queryable: TripQueryable,
  scope: RouteOccurrenceScope,
): Promise<readonly RouteOccurrenceRow[]> {
  const rows = await queryable
    .select({
      actorUserId: tripStopOccurrences.actorUserId,
      attachmentObjectId: tripStopOccurrences.attachmentObjectId,
      createdAt: tripStopOccurrences.createdAt,
      description: tripStopOccurrences.description,
      documentId: tripDocuments.id,
      documentNumber: nfeDocuments.number,
      iconName: companyOccurrenceTypes.iconName,
      id: tripStopOccurrences.id,
      kind: tripStopOccurrences.kind,
      signatureObjectId: tripStopOccurrences.signatureObjectId,
      stopId: tripStops.id,
      stopSequence: tripStops.sequence,
      typeId: companyOccurrenceTypes.id,
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
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripStopOccurrences.companyId),
        eq(tripDocuments.id, tripStopOccurrences.tripDocumentId),
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
        eq(tripStopOccurrences.companyId, scope.companyId),
        eq(tripStops.tripId, scope.tripId),
        scope.targetId === undefined ? undefined : eq(tripStopOccurrences.id, scope.targetId),
      ),
    )

  return rows.map((row) => ({
    actorUserId: row.actorUserId,
    attachmentObjectId: row.attachmentObjectId,
    cancelledAt: null,
    createdAt: row.createdAt,
    documentId: row.documentId,
    documentNumber: row.documentNumber,
    id: row.id,
    kind: 'stop',
    note: row.description,
    signatureObjectId: row.signatureObjectId,
    stopId: row.stopId,
    stopSequence: Number(row.stopSequence),
    /** O dado antigo sem tipo do catálogo cai para o `kind` gravado, como a leitura histórica da 218. */
    type: {
      iconName: row.iconName,
      id: row.typeId ?? row.kind,
      name: row.typeName ?? row.kind,
    },
  }))
}

/** A chave de idempotência do toque do app que criou a ocorrência (a do escritório não tem). */
export async function listReportKeysByOccurrence(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, string>> {
  const keys = new Map<string, string>()
  if (input.occurrenceIds.length === 0) return keys
  const rows = await queryable
    .select({
      idempotencyKey: tripFieldReports.idempotencyKey,
      resultId: tripFieldReports.resultId,
    })
    .from(tripFieldReports)
    .where(
      and(
        eq(tripFieldReports.companyId, input.companyId),
        eq(tripFieldReports.channel, TRIP_FIELD_CHANNELS.driverApp),
        inArray(tripFieldReports.resultId, [...input.occurrenceIds]),
      ),
    )
  for (const row of rows) {
    if (row.resultId !== null) keys.set(row.resultId, row.idempotencyKey)
  }
  return keys
}

export type DriverOccurrenceChat = {
  readonly attachments: readonly (DriverRouteOccurrenceChatAttachmentFact & {
    readonly occurrenceId: string
  })[]
  /** Os ids de ocorrência que têm conversa do próprio motorista. */
  readonly occurrenceIdsWithConversation: ReadonlySet<string>
}

/** A conversa do próprio motorista (a mesma regra de alcance da 263) e os anexos das mensagens dela. */
export async function readDriverOccurrenceChat(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly driverUserId: string
    readonly occurrenceIds: readonly string[]
  },
): Promise<DriverOccurrenceChat> {
  if (input.occurrenceIds.length === 0) {
    return { attachments: [], occurrenceIdsWithConversation: new Set() }
  }
  const conversations = await queryable
    .select({ id: occurrenceConversations.id, occurrenceId: occurrenceConversations.occurrenceId })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.participant, 'driver'),
        eq(occurrenceConversations.subjectType, 'occurrence'),
        eq(occurrenceConversations.driverUserId, input.driverUserId),
        inArray(occurrenceConversations.occurrenceId, [...input.occurrenceIds]),
      ),
    )
  const occurrenceByConversation = new Map<string, string>()
  for (const conversation of conversations) {
    if (conversation.occurrenceId !== null) {
      occurrenceByConversation.set(conversation.id, conversation.occurrenceId)
    }
  }
  const occurrenceIdsWithConversation = new Set(occurrenceByConversation.values())
  if (occurrenceByConversation.size === 0) return { attachments: [], occurrenceIdsWithConversation }

  const rows = await queryable
    .select({
      bucket: storedObjects.bucket,
      contentType: occurrenceConversationAttachments.contentType,
      conversationId: occurrenceConversationMessages.conversationId,
      createdAt: occurrenceConversationAttachments.createdAt,
      fileName: occurrenceConversationAttachments.fileName,
      messageId: occurrenceConversationAttachments.messageId,
      objectId: storedObjects.id,
      objectKey: storedObjects.objectKey,
      retentionUntil: storedObjects.retentionUntil,
      sizeBytes: occurrenceConversationAttachments.sizeBytes,
      status: storedObjects.status,
    })
    .from(occurrenceConversationAttachments)
    .innerJoin(
      occurrenceConversationMessages,
      and(
        eq(occurrenceConversationMessages.companyId, occurrenceConversationAttachments.companyId),
        eq(occurrenceConversationMessages.id, occurrenceConversationAttachments.messageId),
      ),
    )
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, occurrenceConversationAttachments.companyId),
        eq(storedObjects.id, occurrenceConversationAttachments.storedObjectId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversationAttachments.companyId, input.companyId),
        inArray(occurrenceConversationMessages.conversationId, [
          ...occurrenceByConversation.keys(),
        ]),
      ),
    )
    .orderBy(occurrenceConversationAttachments.createdAt, occurrenceConversationAttachments.id)

  const attachments = rows.flatMap((row) => {
    const occurrenceId = occurrenceByConversation.get(row.conversationId)
    if (occurrenceId === undefined || row.status === 'deleted') return []
    return [
      {
        bucket: row.bucket,
        contentType: row.contentType,
        createdAt: row.createdAt.toISOString(),
        fileName: row.fileName,
        messageId: row.messageId,
        objectId: row.objectId,
        objectKey: row.objectKey,
        occurrenceId,
        retentionUntil: row.retentionUntil?.toISOString(),
        sizeBytes: row.sizeBytes,
      },
    ]
  })
  return { attachments, occurrenceIdsWithConversation }
}
