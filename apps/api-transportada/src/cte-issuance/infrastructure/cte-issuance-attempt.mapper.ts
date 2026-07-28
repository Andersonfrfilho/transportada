/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { cteIssuanceAttempts } from '../../database/database.schema.js'
import type { CteIssuanceCreatedAttempt } from '../application/cte-issuance.use-case.js'

type CteIssuanceAttemptRecord = typeof cteIssuanceAttempts.$inferSelect

export function mapCteIssuanceAttempt(record: CteIssuanceAttemptRecord): CteIssuanceCreatedAttempt {
  const fiscalEnvironment = record.fiscalEnvironment
  const fiscalNumber = record.fiscalNumber.toString()
  const fiscalSeries = record.fiscalSeries

  return {
    attemptFingerprint: record.requestFingerprint,
    attemptId: record.id,
    attemptKind: getCteIssuanceAttemptKind(record.attemptKind),
    attemptNumber: record.attemptNumber.toString(),
    batchId: record.batchId,
    companyId: record.companyId,
    fiscalEnvironment,
    fiscalNumber,
    fiscalSeries,
    context: {
      attemptId: record.id,
      batchId: record.batchId,
      batchItemId: record.batchItemId,
      companyId: record.companyId,
      fiscalEnvironment,
      fiscalNumber,
      fiscalSeries,
    },
  }
}

export function getCteIssuanceAttemptKind(
  kind: CteIssuanceAttemptRecord['attemptKind'],
): 'issue' | 'reprocess' | 'cancel' {
  if (kind === 'issue' || kind === 'reprocess' || kind === 'cancel') return kind
  throw new Error('CTE_ISSUANCE_UNSUPPORTED_ATTEMPT_KIND')
}
