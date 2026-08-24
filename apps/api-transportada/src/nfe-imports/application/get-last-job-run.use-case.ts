/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ScheduledJob } from '../../shared/job-catalog.constant.js'
import type { JobRunSnapshot, LastJobRunReaderPort } from './nfe-import.types.js'

const DISTRIBUTION_JOB: ScheduledJob = 'nfe.distribution.pull'

export function createGetLastJobRunUseCase(dependencies: {
  readonly reader: LastJobRunReaderPort
}) {
  return {
    execute: (input: { readonly context: CompanyContext }): Promise<JobRunSnapshot | null> =>
      dependencies.reader.readLastRun({
        companyId: input.context.companyId,
        job: DISTRIBUTION_JOB,
      }),
  }
}
