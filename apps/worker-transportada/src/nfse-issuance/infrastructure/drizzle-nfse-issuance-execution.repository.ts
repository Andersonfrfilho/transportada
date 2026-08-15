/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import {
  nfseIssuanceAttempts,
  nfseIssuancePayloads,
  nfseProviderCredentials,
  nfseServiceInvoices,
} from '../../database/nfse-issuance-execution.schema.js'
import type {
  NfseIssuanceExecutionInput,
  NfseIssuanceExecutionInputReader,
} from '../application/nfse-issuance-consumer.effect.js'
import { NFSE_NON_SETTLED_ATTEMPT_STATUSES } from '../domain/nfse-attempt-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_CREDENTIAL_STATUS = 'active'

export class DrizzleNfseIssuanceExecutionRepository implements NfseIssuanceExecutionInputReader {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * O motivo do cancelamento é lido aqui, da linha da nota, e não do envelope: texto livre do
   * operador não atravessa o broker (`security.md` §6). `undefined` significa nada a transmitir.
   */
  async load(input: {
    readonly attemptId: string
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<NfseIssuanceExecutionInput | undefined> {
    const [row] = await this.#database
      .select({
        cancellationReason: nfseServiceInvoices.cancellationReason,
        credentialId: nfseProviderCredentials.id,
        envelope: nfseProviderCredentials.secretEnvelope,
        fiscalEnvironment: nfseIssuanceAttempts.fiscalEnvironment,
        payload: nfseIssuancePayloads.payload,
        providerDocumentId: nfseServiceInvoices.providerDocumentId,
      })
      .from(nfseIssuanceAttempts)
      .innerJoin(
        nfseServiceInvoices,
        and(
          eq(nfseServiceInvoices.companyId, nfseIssuanceAttempts.companyId),
          eq(nfseServiceInvoices.id, nfseIssuanceAttempts.invoiceId),
        ),
      )
      /**
       * Só a emissão congela payload. Obrigatório, o vínculo apagava a tentativa de cancelamento da
       * consulta, e o efeito a tratava como linha que sumiu: mensagem confirmada, nada transmitido.
       */
      .leftJoin(
        nfseIssuancePayloads,
        and(
          eq(nfseIssuancePayloads.companyId, nfseIssuanceAttempts.companyId),
          eq(nfseIssuancePayloads.attemptId, nfseIssuanceAttempts.id),
        ),
      )
      .innerJoin(
        nfseProviderCredentials,
        and(
          eq(nfseProviderCredentials.companyId, nfseIssuanceAttempts.companyId),
          eq(nfseProviderCredentials.fiscalEnvironment, nfseIssuanceAttempts.fiscalEnvironment),
          eq(nfseProviderCredentials.status, ACTIVE_CREDENTIAL_STATUS),
        ),
      )
      .where(
        and(
          eq(nfseIssuanceAttempts.companyId, input.companyId),
          eq(nfseIssuanceAttempts.id, input.attemptId),
          eq(nfseIssuanceAttempts.invoiceId, input.invoiceId),
          inArray(nfseIssuanceAttempts.status, NFSE_NON_SETTLED_ATTEMPT_STATUSES),
        ),
      )
      .limit(1)

    if (row === undefined) return undefined

    return {
      credential: {
        companyId: input.companyId,
        credentialId: row.credentialId,
        envelope: row.envelope,
        fiscalEnvironment: row.fiscalEnvironment,
      },
      ...(row.payload === null ? {} : { payload: row.payload }),
      ...(row.cancellationReason === null ? {} : { cancellationReason: row.cancellationReason }),
      ...(row.providerDocumentId === null ? {} : { providerDocumentId: row.providerDocumentId }),
    }
  }
}
