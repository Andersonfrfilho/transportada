/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/nfe.schema.js'
import { createMdfeRetryPolicy, type MdfeRetryPolicy } from '../domain/mdfe-retry.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleMdfeRetryPolicyRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  // MDF-e compartilha a postura de retransmissão do CT-e: mesma SEFAZ, mesma janela operacional.
  async resolve(input: { readonly companyId: string }): Promise<MdfeRetryPolicy> {
    const [record] = await this.#database
      .select({
        backoffSeconds: companyFiscalProfiles.cteRetryBackoffSeconds,
        maxAttempts: companyFiscalProfiles.cteRetryMaxAttempts,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    return createMdfeRetryPolicy(record ?? {})
  }
}
