/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  cteBatchItemDocuments,
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

  /** Todas as notas do item, não só a principal. Item sem nota nenhuma: falha fechada, nunca aberta. */
  async isAuthorized(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<boolean> {
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

    return rows.length > 0 && rows.every((row) => row.status === NFE_DOCUMENT_AUTHORIZED_STATUS)
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
