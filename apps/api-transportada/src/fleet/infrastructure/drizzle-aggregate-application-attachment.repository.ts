/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomUUID } from 'node:crypto'

import {
  aggregateApplicationAttachments,
  aggregateAttachmentOutbox,
} from '../../database/aggregate-application.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { AggregateApplicationAttachmentRepositoryPort } from '../application/aggregate-application-attachment.port.js'
import type { AggregateDocumentDatabase } from './drizzle-aggregate-document.repository.js'

const ATTACHMENT_PURPOSE = 'aggregate_application_attachment'
const EXTRACTION_REQUESTED_EVENT = 'attachment.extraction.requested'

export function createDrizzleAggregateApplicationAttachmentRepository(
  database: AggregateDocumentDatabase,
): AggregateApplicationAttachmentRepositoryPort {
  return {
    async createDraft({
      bucket,
      companyId,
      correlationId,
      draftId,
      mimeType,
      objectKey,
      provider,
      sha256,
      sizeBytes,
      type,
    }) {
      const storedObjectId = randomUUID()

      /**
       * As três linhas numa transação: objeto sem anexo é lixo que ninguém encontra para apagar,
       * anexo sem objeto é uma revisão que abre num arquivo inexistente, e anexo sem evento é anexo
       * que nunca será lido — o `201` teria prometido uma leitura que não vai acontecer (ADR-0053).
       */
      return database.transaction(async (transaction) => {
        await transaction.insert(storedObjects).values({
          bucket,
          companyId,
          id: storedObjectId,
          mimeType,
          objectKey,
          provider,
          purpose: ATTACHMENT_PURPOSE,
          sha256,
          sizeBytes: BigInt(sizeBytes),
          status: 'final',
        })

        const [row] = await transaction
          .insert(aggregateApplicationAttachments)
          .values({ companyId, draftId, storedObjectId, type })
          .returning({
            draftId: aggregateApplicationAttachments.draftId,
            id: aggregateApplicationAttachments.id,
            type: aggregateApplicationAttachments.type,
          })

        if (row === undefined) throw new Error('aggregate application attachment draft not created')

        /**
         * O payload carrega **referência**, nunca os bytes (`security.md` §6): o worker busca o
         * objeto no bucket. Um PDF com CPF e endereço dentro de uma fila seria PII em repouso, num
         * lugar sem prazo de descarte nenhum.
         */
        await transaction.insert(aggregateAttachmentOutbox).values({
          attachmentId: row.id,
          companyId,
          correlationId,
          eventType: EXTRACTION_REQUESTED_EVENT,
          payload: { attachmentId: row.id, bucket, objectKey, type },
        })

        return { draftId: row.draftId, type: row.type }
      })
    },
  }
}
