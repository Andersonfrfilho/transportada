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
import {
  canReuseProviderDocumentId,
  parseProviderApiVersion,
  resolveLatestIssuanceApiVersion,
  type NfseProviderApiVersion,
} from '../domain/nfse-provider-api-version.policy.js'
import { listIssuanceAttemptHistory } from './drizzle-nfse-issuance-history.reader.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_CREDENTIAL_STATUS = 'active'
const CANCEL_ATTEMPT_KIND = 'cancel'

export class DrizzleNfseIssuanceExecutionRepository implements NfseIssuanceExecutionInputReader {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * O código do motivo do cancelamento é lido aqui, da linha da nota, e não do envelope: payload de
   * mensagem carrega referência (`security.md` §6). O texto livre do operador fica na nota e não é
   * selecionado — o worker não precisa dele, e o que não sai da tabela não vaza. `undefined`
   * significa nada a transmitir.
   */
  async load(input: {
    readonly attemptId: string
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<NfseIssuanceExecutionInput | undefined> {
    const [row] = await this.#database
      .select({
        attemptKind: nfseIssuanceAttempts.attemptKind,
        attemptNumber: nfseIssuanceAttempts.attemptNumber,
        cancellationMotive: nfseServiceInvoices.cancellationMotive,
        credentialId: nfseProviderCredentials.id,
        envelope: nfseProviderCredentials.secretEnvelope,
        fiscalEnvironment: nfseIssuanceAttempts.fiscalEnvironment,
        municipalRegistration: nfseProviderCredentials.municipalRegistration,
        payload: nfseIssuancePayloads.payload,
        providerConfig: nfseIssuancePayloads.providerConfig,
        providerDocumentId: nfseServiceInvoices.providerDocumentId,
        providerRequestKey: nfseIssuanceAttempts.providerRequestKey,
        taxId: nfseProviderCredentials.taxId,
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

    const isCancellation = row.attemptKind === CANCEL_ATTEMPT_KIND
    const needsHistory = isCancellation || row.providerDocumentId !== null
    const history = needsHistory
      ? ((
          await listIssuanceAttemptHistory({
            companyIds: [input.companyId],
            db: this.#database,
            invoiceIds: [input.invoiceId],
          })
        ).get(input.invoiceId) ?? [])
      : []
    const providerApiVersion: NfseProviderApiVersion = isCancellation
      ? resolveLatestIssuanceApiVersion(history)
      : parseProviderApiVersion(row.providerConfig)
    const canReuseDocument =
      !isCancellation &&
      row.providerDocumentId !== null &&
      canReuseProviderDocumentId({ attemptNumber: row.attemptNumber, history })

    return {
      providerApiVersion,
      credential: {
        companyId: input.companyId,
        credentialId: row.credentialId,
        envelope: row.envelope,
        fiscalEnvironment: row.fiscalEnvironment,
        municipalRegistration: row.municipalRegistration,
        taxId: row.taxId,
      },
      ...(row.providerRequestKey === null ? {} : { providerRequestKey: row.providerRequestKey }),
      ...(canReuseDocument && row.providerDocumentId !== null
        ? { reissueProviderDocumentId: row.providerDocumentId }
        : {}),
      ...(row.payload === null ? {} : { payload: row.payload }),
      ...(row.cancellationMotive === null ? {} : { cancellationMotive: row.cancellationMotive }),
      ...(row.providerDocumentId === null ? {} : { providerDocumentId: row.providerDocumentId }),
    }
  }
}
