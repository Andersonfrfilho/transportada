/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702e: os anexos que saem no e-mail à contratante. O e-mail da 143 não tem anexo próprio:
 * a API liga os arquivos à mensagem **da conversa**, que aponta para o e-mail por `mail_message_id`.
 * Tudo filtra pela empresa do envelope na mesma condição; objeto apagado (retenção) vem marcado
 * indisponível, e o envio falha em vez de sair sem o arquivo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import type { ContractorMailOutboundAttachmentsPort } from '../../contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { storedObjects } from '../../database/nfe.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
} from '../../database/occurrence-conversation.schema.js'
import { CONTRACTOR_REPLY_EMAIL_TARGETS } from '../../shared/occurrence-contractor-reply.constant.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createContractorMailOutboundAttachments(dependencies: {
  readonly database: Database
  readonly storage: Pick<NfeStorageGateway, 'getObjectStream' | 'headObject'>
}): ContractorMailOutboundAttachmentsPort {
  return {
    async list({ companyId, messageId }) {
      /** Spec 248 T4.7: o boleto levado a um terceiro aponta o anexo pela entrega, não por mensagem de conversa. */
      const forwarded = (await dependencies.database.execute(
        sql`select stored.bucket as bucket, stored.deleted_at as deleted_at, stored.status as status,
                   attachment.content_type as content_type, attachment.file_name as file_name,
                   stored.object_key as key, attachment.sha256 as sha256, attachment.size_bytes as size_bytes
            from occurrence_contractor_reply_deliveries delivery
            join occurrence_conversation_attachments attachment
              on attachment.company_id = delivery.company_id and attachment.id = delivery.attachment_id
            join stored_objects stored
              on stored.company_id = attachment.company_id and stored.id = attachment.stored_object_id
            where delivery.company_id = ${companyId}::uuid
              and delivery.mail_message_id = ${messageId}::uuid
              and delivery.target in (${sql.join(
                CONTRACTOR_REPLY_EMAIL_TARGETS.map((target) => sql`${target}`),
                sql`, `,
              )})`,
      )) as readonly Record<string, unknown>[]
      if (forwarded.length > 0) {
        return forwarded.map((row) => ({
          available: row.status !== 'deleted' && row.deleted_at === null,
          bucket: String(row.bucket),
          contentType: String(row.content_type),
          fileName: String(row.file_name),
          key: String(row.key),
          sha256: String(row.sha256),
          sizeBytes: Number(row.size_bytes),
        }))
      }
      const rows = await dependencies.database
        .select({
          bucket: storedObjects.bucket,
          deletedAt: storedObjects.deletedAt,
          status: storedObjects.status,
          contentType: occurrenceConversationAttachments.contentType,
          fileName: occurrenceConversationAttachments.fileName,
          key: storedObjects.objectKey,
          sha256: occurrenceConversationAttachments.sha256,
          sizeBytes: occurrenceConversationAttachments.sizeBytes,
        })
        .from(occurrenceConversationMessages)
        .innerJoin(
          occurrenceConversationAttachments,
          and(
            eq(
              occurrenceConversationAttachments.companyId,
              occurrenceConversationMessages.companyId,
            ),
            eq(occurrenceConversationAttachments.messageId, occurrenceConversationMessages.id),
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
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.mailMessageId, messageId),
          ),
        )
        .orderBy(
          asc(occurrenceConversationAttachments.createdAt),
          asc(occurrenceConversationAttachments.id),
        )
      /** Apagado continua na lista, marcado: o envio falha em vez de sair sem o arquivo (F1). */
      return rows.map(({ deletedAt, status, ...row }) => ({
        ...row,
        available: status !== 'deleted' && deletedAt === null,
      }))
    },

    async read(location) {
      const head = await dependencies.storage.headObject(location)
      if (head === undefined) return undefined
      const stream = await dependencies.storage.getObjectStream(location)
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }
}
