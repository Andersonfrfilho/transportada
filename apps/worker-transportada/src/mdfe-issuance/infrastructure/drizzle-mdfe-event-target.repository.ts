/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { mdfeFiscalDocuments } from '../../database/mdfe-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type MdfeEventTarget = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly cancellationJustification: string | null
  readonly closureCityCode: string | null
  readonly closureState: string | null
  readonly issuanceAttemptId: string
  readonly status: string
}

export class DrizzleMdfeEventTargetRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findAuthorizedDocument(input: {
    readonly companyId: string
    readonly manifestId: string
  }): Promise<MdfeEventTarget | null> {
    const [document] = await this.#database
      .select({
        accessKey: mdfeFiscalDocuments.accessKey,
        authorizationProtocol: mdfeFiscalDocuments.authorizationProtocol,
        cancellationJustification: mdfeFiscalDocuments.cancellationJustification,
        closureCityCode: mdfeFiscalDocuments.closureCityCode,
        closureState: mdfeFiscalDocuments.closureState,
        issuanceAttemptId: mdfeFiscalDocuments.attemptId,
        status: mdfeFiscalDocuments.status,
      })
      .from(mdfeFiscalDocuments)
      .where(
        and(
          eq(mdfeFiscalDocuments.companyId, input.companyId),
          eq(mdfeFiscalDocuments.manifestId, input.manifestId),
        ),
      )
      .limit(1)

    return document ?? null
  }
}
