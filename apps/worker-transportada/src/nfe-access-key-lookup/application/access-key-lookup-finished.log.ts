/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupReason } from '../../database/nfe.schema.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { NFE_ACCESS_KEY_LOOKUP_FINISHED_LOG } from '../domain/nfe-access-key-lookup.constant.js'
import type { AccessKeyLookupRecord } from './process-access-key-lookup.types.js'

const ACCESS_KEY_LAST_DIGITS = 4

export type LookupFinishedEntry = {
  readonly budgetLeft?: number
  readonly cStat?: string
  readonly lookup: AccessKeyLookupRecord
  readonly reason?: NfeAccessKeyLookupReason
  readonly status: 'failed' | 'imported' | 'refused' | 'waiting'
}

export function logLookupFinished(params: {
  readonly entry: LookupFinishedEntry
  readonly logger: WorkerLogger
}): void {
  const { entry } = params
  safeLogInfo({
    logger: params.logger,
    message: NFE_ACCESS_KEY_LOOKUP_FINISHED_LOG,
    metadata: {
      accessKeyLast4: entry.lookup.accessKey.slice(-ACCESS_KEY_LAST_DIGITS),
      companyId: entry.lookup.companyId,
      lookupId: entry.lookup.id,
      status: entry.status,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      ...(entry.cStat === undefined ? {} : { cStat: entry.cStat }),
      ...(entry.budgetLeft === undefined ? {} : { budgetLeft: entry.budgetLeft }),
    },
  })
}
