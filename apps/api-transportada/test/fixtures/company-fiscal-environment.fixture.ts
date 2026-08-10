/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyFiscalEnvironmentPort } from '../../src/companies/application/company-fiscal-environment.port'
import type { FiscalEnvironment } from '../../src/database/database.schema'

export function stubCompanyFiscalEnvironment(
  environment: FiscalEnvironment | null = 'homologation',
): CompanyFiscalEnvironmentPort {
  return {
    async readEnvironment() {
      return environment
    },
  }
}
