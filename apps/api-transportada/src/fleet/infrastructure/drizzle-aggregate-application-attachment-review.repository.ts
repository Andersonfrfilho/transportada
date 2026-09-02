/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { aggregateApplicationAttachments } from '../../database/aggregate-application.schema.js'
import { aggregateApplications, aggregateDocuments } from '../../database/database.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { AggregateApplicationAttachmentReviewRepositoryPort } from '../application/aggregate-application-attachment-review.use-case.js'
import type { AggregateDocumentDatabase } from './drizzle-aggregate-document.repository.js'

/** O documento da candidatura é da pessoa que a enviou: o CPF/CNPJ vem da candidatura, não do anexo. */
const attachmentColumns = {
  extractedFields: aggregateApplicationAttachments.extractedFields,
  id: aggregateApplicationAttachments.id,
  rejectionReason: aggregateApplicationAttachments.rejectionReason,
  status: aggregateApplicationAttachments.status,
  taxId: aggregateApplications.taxId,
  type: aggregateApplicationAttachments.type,
} as const

export function createDrizzleAggregateApplicationAttachmentReviewRepository(
  database: AggregateDocumentDatabase,
): AggregateApplicationAttachmentReviewRepositoryPort & {
  readonly findDownloadLocation: (input: {
    readonly attachmentId: string
    readonly companyId: string
  }) => Promise<Readonly<{ bucket: string; objectKey: string }> | null>
} {
  return {
    async findDownloadLocation({ attachmentId, companyId }) {
      const [row] = await database
        .select({ bucket: storedObjects.bucket, objectKey: storedObjects.objectKey })
        .from(aggregateApplicationAttachments)
        .innerJoin(
          storedObjects,
          and(
            eq(storedObjects.companyId, aggregateApplicationAttachments.companyId),
            eq(storedObjects.id, aggregateApplicationAttachments.storedObjectId),
          ),
        )
        .where(
          and(
            eq(aggregateApplicationAttachments.id, attachmentId),
            eq(aggregateApplicationAttachments.companyId, companyId),
          ),
        )

      return row ?? null
    },

    async findForReview({ attachmentId, companyId }) {
      const [row] = await database
        .select(attachmentColumns)
        .from(aggregateApplicationAttachments)
        .innerJoin(
          aggregateApplications,
          eq(aggregateApplications.id, aggregateApplicationAttachments.applicationId),
        )
        .where(
          and(
            eq(aggregateApplicationAttachments.id, attachmentId),
            eq(aggregateApplicationAttachments.companyId, companyId),
          ),
        )

      return row ?? null
    },

    async listByApplication({ applicationId, companyId }) {
      return database
        .select(attachmentColumns)
        .from(aggregateApplicationAttachments)
        .innerJoin(
          aggregateApplications,
          eq(aggregateApplications.id, aggregateApplicationAttachments.applicationId),
        )
        .where(
          and(
            eq(aggregateApplicationAttachments.applicationId, applicationId),
            eq(aggregateApplicationAttachments.companyId, companyId),
          ),
        )
    },

    /**
     * O documento da conta aponta para o **mesmo** objeto do anexo: promover não copia bytes, e o
     * arquivo que o operador aprovou é literalmente o que a conta passa a ter.
     */
    async promoteToAggregateDocument({ attachmentId, companyId, reviewedBy, taxId, type }) {
      const [attachment] = await database
        .select({ storedObjectId: aggregateApplicationAttachments.storedObjectId })
        .from(aggregateApplicationAttachments)
        .where(
          and(
            eq(aggregateApplicationAttachments.id, attachmentId),
            eq(aggregateApplicationAttachments.companyId, companyId),
          ),
        )
      if (attachment === undefined) return

      await database
        .insert(aggregateDocuments)
        .values({
          companyId,
          reviewedAt: new Date(),
          reviewedBy,
          status: 'approved',
          storedObjectId: attachment.storedObjectId,
          taxId,
          type: type as 'cnh' | 'crlv',
        })
        .onConflictDoUpdate({
          set: {
            rejectionReason: '',
            reviewedAt: new Date(),
            reviewedBy,
            status: 'approved',
            storedObjectId: attachment.storedObjectId,
            updatedAt: new Date(),
          },
          target: [aggregateDocuments.companyId, aggregateDocuments.taxId, aggregateDocuments.type],
        })
    },

    /**
     * A decisão **descarta a leitura**. `extracted_fields` guarda o que o servidor leu do documento —
     * o CPF do proprietário no CRLV, o número de registro e o nome na CNH —, em texto puro e numa
     * tabela sem prazo de descarte. A coluna existe para a conferência do operador; tomada a
     * decisão, ela é cópia redundante de dado pessoal, e o arquivo original continua no bucket para
     * quem precisar reabrir (achado de 02/09/2026 no `docs/SECURITY.md`).
     *
     * Vai no **mesmo `UPDATE`**, não numa segunda escrita: em duas, uma falha no meio deixaria a PII
     * para trás justamente no caminho de erro, que é o menos observado. A trilha do que foi decidido
     * — `status`, `reviewed_by`, `reviewed_at`, `rejection_reason` — não é tocada.
     */
    async review({ attachmentId, companyId, decision, rejectionReason, reviewedBy }) {
      const updated = await database
        .update(aggregateApplicationAttachments)
        .set({
          extractedFields: null,
          rejectionReason,
          reviewedAt: new Date(),
          reviewedBy,
          status: decision,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aggregateApplicationAttachments.id, attachmentId),
            eq(aggregateApplicationAttachments.companyId, companyId),
          ),
        )
        .returning({ id: aggregateApplicationAttachments.id })
      if (updated.length === 0) return null

      // Relê pelo mesmo select da listagem em vez de montar a view no `returning`: o `taxId` vem da
      // candidatura, e devolvê-lo vazio aqui seria inventar dado para caber num tipo.
      return this.findForReview({ attachmentId, companyId })
    },
  }
}
