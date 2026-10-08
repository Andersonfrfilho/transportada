/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import {
  nfseIssuanceAttempts,
  nfseIssuancePayloads,
} from '../../database/nfse-issuance-execution.schema.js'
import type { NfseIssuanceAttemptHistoryEntry } from '../domain/nfse-provider-api-version.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ISSUE_ATTEMPT_KIND = 'issue'

/**
 * As tentativas de **emissão** de cada nota, com o `provider_config` congelado. Cancelamento não
 * congela payload: a versão da nota é a da emissão, nunca a de uma tentativa de cancelar.
 */
export async function listIssuanceAttemptHistory(input: {
  readonly companyIds: readonly string[]
  readonly db: Database
  readonly invoiceIds: readonly string[]
}): Promise<ReadonlyMap<string, readonly NfseIssuanceAttemptHistoryEntry[]>> {
  const rows = await input.db
    .select({
      attemptNumber: nfseIssuanceAttempts.attemptNumber,
      invoiceId: nfseIssuanceAttempts.invoiceId,
      payload: nfseIssuancePayloads.payload,
      providerConfig: nfseIssuancePayloads.providerConfig,
    })
    .from(nfseIssuanceAttempts)
    .leftJoin(
      nfseIssuancePayloads,
      and(
        eq(nfseIssuancePayloads.companyId, nfseIssuanceAttempts.companyId),
        eq(nfseIssuancePayloads.attemptId, nfseIssuanceAttempts.id),
      ),
    )
    .where(
      and(
        inArray(nfseIssuanceAttempts.companyId, input.companyIds),
        inArray(nfseIssuanceAttempts.invoiceId, input.invoiceIds),
        eq(nfseIssuanceAttempts.attemptKind, ISSUE_ATTEMPT_KIND),
      ),
    )

  const byInvoice = new Map<string, NfseIssuanceAttemptHistoryEntry[]>()
  for (const row of rows) {
    const entries = byInvoice.get(row.invoiceId) ?? []
    entries.push({
      attemptNumber: row.attemptNumber,
      payload: row.payload,
      providerConfig: row.providerConfig,
    })
    byInvoice.set(row.invoiceId, entries)
  }
  return byInvoice
}
