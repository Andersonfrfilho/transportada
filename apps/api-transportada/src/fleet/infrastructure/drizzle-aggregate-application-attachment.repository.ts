/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomUUID } from 'node:crypto'

import { aggregateApplicationAttachments } from '../../database/aggregate-application.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { AggregateApplicationAttachmentRepositoryPort } from '../application/aggregate-application-attachment.port.js'
import type { AggregateDocumentDatabase } from './drizzle-aggregate-document.repository.js'

const ATTACHMENT_PURPOSE = 'aggregate_application_attachment'

export function createDrizzleAggregateApplicationAttachmentRepository(
  database: AggregateDocumentDatabase,
): AggregateApplicationAttachmentRepositoryPort {
  return {
    async createDraft({
      bucket,
      companyId,
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
       * As duas linhas numa transação: objeto sem anexo é lixo que ninguém encontra para apagar, e
       * anexo sem objeto é uma revisão que abre num arquivo inexistente.
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
            type: aggregateApplicationAttachments.type,
          })

        if (row === undefined) throw new Error('aggregate application attachment draft not created')
        return row
      })
    },
  }
}
