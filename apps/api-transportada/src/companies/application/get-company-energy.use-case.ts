/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  resolveCompanyEnergySettings,
  type CompanyEnergySettings,
} from '../domain/company-energy.policy.js'
import type { CompanyEnergyPort } from './company-energy.port.js'

export function createGetCompanyEnergyUseCase(input: { readonly energy: CompanyEnergyPort }): {
  readonly execute: (request: { readonly companyId: string }) => Promise<CompanyEnergySettings>
} {
  return {
    execute: async ({ companyId }) => {
      const [catalog, choice] = await Promise.all([
        input.energy.listDistributors(),
        input.energy.loadChoice({ companyId }),
      ])
      return resolveCompanyEnergySettings({ catalog, choice })
    },
  }
}
