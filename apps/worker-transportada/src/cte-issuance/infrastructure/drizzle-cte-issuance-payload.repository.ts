/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { cteIssuancePayloads } from '../../database/cte-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CteIssuancePersistedPayload = {
  readonly payload: unknown
  readonly providerConfig: unknown
}

export class DrizzleCteIssuancePayloadRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findByAttempt(input: {
    readonly attemptId: string
    readonly companyId: string
  }): Promise<CteIssuancePersistedPayload | null> {
    const [record] = await this.#database
      .select({
        payload: cteIssuancePayloads.payload,
        providerConfig: cteIssuancePayloads.providerConfig,
      })
      .from(cteIssuancePayloads)
      .where(
        and(
          eq(cteIssuancePayloads.companyId, input.companyId),
          eq(cteIssuancePayloads.attemptId, input.attemptId),
        ),
      )
      .limit(1)
    return record ?? null
  }
}
