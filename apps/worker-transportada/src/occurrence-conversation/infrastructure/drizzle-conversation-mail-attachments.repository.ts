/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702e: os anexos que saem no e-mail à contratante. O e-mail da 143 não tem anexo próprio:
 * a API liga os arquivos à mensagem **da conversa**, que aponta para o e-mail por `mail_message_id`.
 * Tudo filtra pela empresa do envelope na mesma condição; objeto apagado (retenção) vem marcado
 * indisponível, e o envio falha em vez de sair sem o arquivo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import type { ContractorMailOutboundAttachmentsPort } from '../../contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { storedObjects } from '../../database/nfe.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
} from '../../database/occurrence-conversation.schema.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createContractorMailOutboundAttachments(dependencies: {
  readonly database: Database
  readonly storage: Pick<NfeStorageGateway, 'getObjectStream' | 'headObject'>
}): ContractorMailOutboundAttachmentsPort {
  return {
    async list({ companyId, messageId }) {
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
