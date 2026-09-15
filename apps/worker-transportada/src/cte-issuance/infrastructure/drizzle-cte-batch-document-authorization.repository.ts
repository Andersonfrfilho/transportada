/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-issuance-execution.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const AUTHORIZED_STATUS = 'authorized'

/**
 * Spec 149 T4: a nota pode ter sido cancelada ou denegada depois da seleção do lote — a última
 * palavra antes de assinar com a SEFAZ é o status atual da nota, não o que a API viu na seleção.
 * Item sem vínculo (lote ou nota removidos) também não autoriza: falha fechada, nunca aberta.
 */
export class DrizzleCteBatchDocumentAuthorizationRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async isAuthorized(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<boolean> {
    const [record] = await this.#database
      .select({ status: nfeDocuments.status })
      .from(cteBatchItems)
      .innerJoin(
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

    return record?.status === AUTHORIZED_STATUS
  }
}
