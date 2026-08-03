/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, inArray, type SQL } from 'drizzle-orm'

import { mdfeIssuanceAttempts, type MdfeAttemptKind } from '../../database/mdfe.schema.js'
import type { MdfeManifestRejection } from '../application/mdfe-manifest.port.js'

const REJECTED_STATUS = 'rejected'
const UNKNOWN_REJECTION_CODE = 'FISCAL_REJECTED'

type RejectionRecord = {
  readonly attemptKind: MdfeAttemptKind
  readonly lastErrorCode: string | null
  readonly lastErrorMessage: string | null
  readonly manifestId: string
  readonly updatedAt: Date
}

export function buildManifestRejectionFilters({
  companyId,
  manifestIds,
}: {
  readonly companyId: string
  readonly manifestIds: readonly string[]
}): readonly SQL[] {
  return [
    eq(mdfeIssuanceAttempts.companyId, companyId),
    inArray(mdfeIssuanceAttempts.manifestId, [...manifestIds]),
    eq(mdfeIssuanceAttempts.status, REJECTED_STATUS),
  ]
}

/** Só a recusa mais nova explica o estado atual — a anterior já foi respondida por outra tentativa. */
export function indexLastRejections(
  records: readonly RejectionRecord[],
): ReadonlyMap<string, MdfeManifestRejection> {
  const latest = new Map<string, RejectionRecord>()

  for (const record of records) {
    const current = latest.get(record.manifestId)
    if (current === undefined || current.updatedAt < record.updatedAt) {
      latest.set(record.manifestId, record)
    }
  }

  return new Map(
    [...latest].map(([manifestId, record]) => [manifestId, mapRejection(record)] as const),
  )
}

function mapRejection(record: RejectionRecord): MdfeManifestRejection {
  return {
    attemptKind: record.attemptKind,
    code: record.lastErrorCode ?? UNKNOWN_REJECTION_CODE,
    message: record.lastErrorMessage,
    occurredAt: record.updatedAt.toISOString(),
  }
}
