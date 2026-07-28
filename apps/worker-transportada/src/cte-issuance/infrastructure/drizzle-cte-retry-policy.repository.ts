/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/nfe.schema.js'
import { createCteRetryPolicy, type CteRetryPolicy } from '../domain/cte-retry.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCteRetryPolicyRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async resolve(input: { readonly companyId: string }): Promise<CteRetryPolicy> {
    const [record] = await this.#database
      .select({
        backoffSeconds: companyFiscalProfiles.cteRetryBackoffSeconds,
        maxAttempts: companyFiscalProfiles.cteRetryMaxAttempts,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    return createCteRetryPolicy(record ?? {})
  }
}
