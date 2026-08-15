/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, sql } from 'drizzle-orm'

import { nfseProviderCredentials, nfseServiceInvoices } from '../../database/nfse.schema.js'
import type {
  AnticipateStatusChecksParams,
  NfseCallbackCredential,
  NfseCallbackRepositoryPort,
} from '../application/nfse-callback.port.js'
import {
  buildActiveCallbackCredentialFilters,
  buildCallbackAnticipationFilters,
} from './nfse-callback.query.js'

type NfseCallbackDatabase = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfseCallbackRepository implements NfseCallbackRepositoryPort {
  public constructor(private readonly database: NfseCallbackDatabase) {}

  public async listActiveCallbackCredentials(): Promise<readonly NfseCallbackCredential[]> {
    return this.database
      .select({
        callbackTokenSha256: nfseProviderCredentials.callbackTokenSha256,
        companyId: nfseProviderCredentials.companyId,
      })
      .from(nfseProviderCredentials)
      .where(and(...buildActiveCallbackCredentialFilters()))
  }

  public async anticipateStatusChecks({ companyId }: AnticipateStatusChecksParams): Promise<void> {
    // Só a coluna de agendamento: nada de `updated_at`, `version` ou transição de status.
    await this.database
      .update(nfseServiceInvoices)
      .set({ nextStatusCheckAt: sql`now()` })
      .where(and(...buildCallbackAnticipationFilters({ companyId })))
  }
}
