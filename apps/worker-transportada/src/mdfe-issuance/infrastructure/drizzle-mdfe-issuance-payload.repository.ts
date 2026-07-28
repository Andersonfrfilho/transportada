/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { mdfeIssuancePayloads } from '../../database/mdfe-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type MdfeIssuancePersistedPayload = {
  readonly payload: unknown
  readonly providerConfig: unknown
}

export class DrizzleMdfeIssuancePayloadRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findByAttempt(input: {
    readonly attemptId: string
    readonly companyId: string
  }): Promise<MdfeIssuancePersistedPayload | null> {
    const [record] = await this.#database
      .select({
        payload: mdfeIssuancePayloads.payload,
        providerConfig: mdfeIssuancePayloads.providerConfig,
      })
      .from(mdfeIssuancePayloads)
      .where(
        and(
          eq(mdfeIssuancePayloads.companyId, input.companyId),
          eq(mdfeIssuancePayloads.attemptId, input.attemptId),
        ),
      )
      .limit(1)
    return record ?? null
  }
}
