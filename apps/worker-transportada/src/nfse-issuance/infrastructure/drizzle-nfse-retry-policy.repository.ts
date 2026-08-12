/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/nfe.schema.js'
import { createNfseRetryPolicy, type NfseRetryPolicy } from '../domain/nfse-retry.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfseRetryPolicyRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /** Colunas próprias: a indisponibilidade da prefeitura não tem a janela da SEFAZ. */
  async resolve(input: { readonly companyId: string }): Promise<NfseRetryPolicy> {
    const [record] = await this.#database
      .select({
        backoffSeconds: companyFiscalProfiles.nfseRetryBackoffSeconds,
        maxAttempts: companyFiscalProfiles.nfseRetryMaxAttempts,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    return createNfseRetryPolicy(record ?? {})
  }
}
