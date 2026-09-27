/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o pedido de upload, a ligação do anexo à mensagem e a leitura dos anexos,
 * no Postgres. Tudo pela empresa do contexto; o pedido só volta para o mesmo alvo (ocorrência,
 * participante, canal e quem pediu) e só enquanto `pending`, travado para dois envios da mesma chave
 * não ligarem o mesmo arquivo duas vezes.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  occurrenceConversationAttachments,
  occurrenceConversationUploads,
  storedObjects,
} from '../../database/database.schema.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentTransactionPort,
  ConversationUploadRepositoryPort,
} from '../application/conversation-attachment.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Pick<Database, 'select'>

export function createDrizzleConversationUploadRepository(
  database: Pick<Database, 'insert'>,
): ConversationUploadRepositoryPort {
  return {
    async insertUpload(input) {
      await database.insert(occurrenceConversationUploads).values({
        bucket: input.bucket,
        channel: input.channel,
        companyId: input.companyId,
        declaredContentType: input.declaredContentType,
        declaredSizeBytes: input.declaredSizeBytes,
        expiresAt: input.expiresAt,
        fileName: input.fileName,
        id: input.id,
        objectKey: input.objectKey,
        occurrenceId: input.occurrenceId,
        occurrenceKind: input.occurrenceKind,
        participant: input.participant,
        requestedByUserId: input.requestedByUserId,
      })
    },
  }
}

export function createConversationAttachmentTransactionPort(
  transaction: Transaction,
): ConversationAttachmentTransactionPort {
  return {
    async attachUpload(input) {
      await transaction.insert(storedObjects).values({
        bucket: input.bucket,
        companyId: input.companyId,
        id: input.uploadId,
        mimeType: input.contentType,
        objectKey: input.objectKey,
        provider: 's3',
        purpose: 'occurrence_conversation_attachment',
        sha256: input.sha256,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'final',
      })
      await transaction.insert(occurrenceConversationAttachments).values({
        companyId: input.companyId,
        contentType: input.contentType,
        fileName: input.fileName,
        messageId: input.messageId,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        storedObjectId: input.uploadId,
      })
      await transaction
        .update(occurrenceConversationUploads)
        .set({ attachedAt: input.now, status: 'attached' })
        .where(
          and(
            eq(occurrenceConversationUploads.companyId, input.companyId),
            eq(occurrenceConversationUploads.id, input.uploadId),
          ),
        )
    },

    async lockPendingUploads({ ids, target }) {
      return transaction
        .select({
          bucket: occurrenceConversationUploads.bucket,
          declaredContentType: occurrenceConversationUploads.declaredContentType,
          expiresAt: occurrenceConversationUploads.expiresAt,
          fileName: occurrenceConversationUploads.fileName,
          id: occurrenceConversationUploads.id,
          objectKey: occurrenceConversationUploads.objectKey,
        })
        .from(occurrenceConversationUploads)
        .where(
          and(
            eq(occurrenceConversationUploads.companyId, target.companyId),
            inArray(occurrenceConversationUploads.id, [...ids]),
            eq(occurrenceConversationUploads.occurrenceKind, target.occurrenceKind),
            eq(occurrenceConversationUploads.occurrenceId, target.occurrenceId),
            eq(occurrenceConversationUploads.participant, target.participant),
            eq(occurrenceConversationUploads.channel, target.channel),
            eq(occurrenceConversationUploads.requestedByUserId, target.requestedByUserId),
            eq(occurrenceConversationUploads.status, 'pending'),
          ),
        )
        .for('update')
    },
  }
}

/**
 * O tipo da ocorrência (nota ou parada) pela mesma linha da listagem; `null` para a de outra
 * empresa ou inexistente, igual.
 */
export async function findOccurrenceConversationKind(
  queryable: Parameters<typeof findTripOccurrenceFeedItem>[0],
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<OccurrenceConversationKind | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  return item?.source ?? null
}

/** Os anexos das mensagens pedidas, na ordem em que entraram; a URL é assinada por quem lê. */
export async function readConversationAttachments(
  queryable: Queryable,
  input: { readonly companyId: string; readonly messageIds: readonly string[] },
): Promise<readonly ConversationAttachmentRecord[]> {
  if (input.messageIds.length === 0) return []
  return queryable
    .select({
      bucket: storedObjects.bucket,
      contentType: occurrenceConversationAttachments.contentType,
      fileName: occurrenceConversationAttachments.fileName,
      id: occurrenceConversationAttachments.id,
      messageId: occurrenceConversationAttachments.messageId,
      objectKey: storedObjects.objectKey,
      sizeBytes: occurrenceConversationAttachments.sizeBytes,
    })
    .from(occurrenceConversationAttachments)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, occurrenceConversationAttachments.companyId),
        eq(storedObjects.id, occurrenceConversationAttachments.storedObjectId),
        sql`${storedObjects.status} <> 'deleted'`,
      ),
    )
    .where(
      and(
        eq(occurrenceConversationAttachments.companyId, input.companyId),
        inArray(occurrenceConversationAttachments.messageId, [...input.messageIds]),
      ),
    )
    .orderBy(
      asc(occurrenceConversationAttachments.createdAt),
      asc(occurrenceConversationAttachments.id),
    )
}
