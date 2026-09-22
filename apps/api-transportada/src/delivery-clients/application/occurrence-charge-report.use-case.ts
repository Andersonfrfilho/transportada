/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPage,
  OccurrenceChargeReportPort,
} from './occurrence-charge-report.port.js'

export function createOccurrenceChargeReportUseCase(dependencies: {
  readonly report: OccurrenceChargeReportPort
}): {
  readonly read: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: OccurrenceChargeReportFilters
    }): Promise<OccurrenceChargeReportPage>
  }
} {
  return {
    read: {
      async execute(input): Promise<OccurrenceChargeReportPage> {
        return dependencies.report.read({
          companyId: input.context.companyId,
          filters: input.filters,
        })
      },
    },
  }
}
