/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  cteBatchItemDocuments,
  cteBatchItems,
  cteIssuanceAttempts,
} from '../../database/cte-issuance-execution.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { NFE_DOCUMENT_AUTHORIZED_STATUS } from '../../nfe-documents/domain/nfe-document-status.constant.js'
import type { CteBatchDocumentAuthorizationCheck } from '../application/cte-issuance-consumer.effect.js'
import { mayHaveReachedSefaz } from '../domain/cte-retransmission.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 149 T4: a nota pode ter sido cancelada ou denegada depois da seleção do lote — a última
 * palavra antes de assinar com a SEFAZ é o status atual das notas, não o que a API viu na seleção.
 */
export class DrizzleCteBatchDocumentAuthorizationRepository
  implements CteBatchDocumentAuthorizationCheck
{
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * Com composição, todas as notas do item. Sem composição — lote anterior à migration
   * 20260727133210, que não fez backfill —, a nota da ponte `cte_batch_items.nfe_document_id`. Nem
   * uma nem outra: falha fechada, nunca aberta.
   */
  async isAuthorized(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<boolean> {
    const composition = await this.#readCompositionStatuses(input)
    const statuses = composition.length > 0 ? composition : await this.#readBridgeStatuses(input)

    return (
      statuses.length > 0 && statuses.every((status) => status === NFE_DOCUMENT_AUTHORIZED_STATUS)
    )
  }

  async #readBridgeStatuses(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<ReadonlyArray<string | null>> {
    const rows = await this.#database
      .select({ status: nfeDocuments.status })
      .from(cteBatchItems)
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, cteBatchItems.companyId),
          eq(nfeDocuments.id, cteBatchItems.nfeDocumentId),
        ),
      )
      .where(
        and(eq(cteBatchItems.companyId, input.companyId), eq(cteBatchItems.id, input.batchItemId)),
      )
      .limit(1)
    return rows.map((row) => row.status)
  }

  async #readCompositionStatuses(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<ReadonlyArray<string | null>> {
    const rows = await this.#database
      .select({ status: nfeDocuments.status })
      .from(cteBatchItemDocuments)
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, cteBatchItemDocuments.companyId),
          eq(nfeDocuments.id, cteBatchItemDocuments.nfeDocumentId),
        ),
      )
      .where(
        and(
          eq(cteBatchItemDocuments.companyId, input.companyId),
          eq(cteBatchItemDocuments.itemId, input.batchItemId),
        ),
      )

    return rows.map((row) => row.status)
  }

  async mayHaveReachedSefaz(input: {
    readonly attemptId: string
    readonly companyId: string
  }): Promise<boolean> {
    const [attempt] = await this.#database
      .select({
        lastErrorCause: cteIssuanceAttempts.lastErrorCause,
        status: cteIssuanceAttempts.status,
      })
      .from(cteIssuanceAttempts)
      .where(
        and(
          eq(cteIssuanceAttempts.companyId, input.companyId),
          eq(cteIssuanceAttempts.id, input.attemptId),
        ),
      )
      .limit(1)

    return mayHaveReachedSefaz(attempt ?? null)
  }
}
