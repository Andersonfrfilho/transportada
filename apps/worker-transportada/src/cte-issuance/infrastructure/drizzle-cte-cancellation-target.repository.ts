/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { cteFiscalDocuments } from '../../database/cte-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CteCancellationTarget = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly issuanceAttemptId: string
  readonly justification: string | null
}

export class DrizzleCteCancellationTargetRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findAuthorizedDocument(input: {
    readonly batchItemId: string
    readonly companyId: string
  }): Promise<CteCancellationTarget | null> {
    const [record] = await this.#database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        authorizationProtocol: cteFiscalDocuments.authorizationProtocol,
        issuanceAttemptId: cteFiscalDocuments.attemptId,
        justification: cteFiscalDocuments.cancellationJustification,
      })
      .from(cteFiscalDocuments)
      .where(
        and(
          eq(cteFiscalDocuments.companyId, input.companyId),
          eq(cteFiscalDocuments.batchItemId, input.batchItemId),
        ),
      )
      .limit(1)
    return record ?? null
  }
}
