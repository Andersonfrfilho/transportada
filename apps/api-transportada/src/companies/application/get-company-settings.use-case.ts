/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { CompanySettingsReaderPort, CompanySettingsResult } from './company-settings.port.js'

export function createGetCompanySettingsUseCase(input: {
  readonly repository: CompanySettingsReaderPort
}): {
  readonly execute: (input: {
    readonly context: CompanyContext
  }) => Promise<CompanySettingsResult | null>
} {
  return {
    execute({ context }) {
      return input.repository.findByCompanyId({ companyId: context.companyId })
    },
  }
}
