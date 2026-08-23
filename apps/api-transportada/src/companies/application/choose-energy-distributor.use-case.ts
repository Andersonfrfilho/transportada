/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A lista já foi buscada para conferir a escolha, então a resposta é montada dela: reler seria uma
 * segunda ida ao banco para saber o que acabamos de saber.
 */
import { companyEnergyDistributorUnknown } from '../domain/company-energy.error.js'
import {
  resolveCompanyEnergySettings,
  type CompanyEnergySettings,
} from '../domain/company-energy.policy.js'
import type { CompanyEnergyChoiceInput, CompanyEnergyPort } from './company-energy.port.js'

export function createChooseEnergyDistributorUseCase(input: {
  readonly energy: CompanyEnergyPort
}): {
  readonly execute: (request: CompanyEnergyChoiceInput) => Promise<CompanyEnergySettings>
} {
  return {
    execute: async (request) => {
      const catalog = await input.energy.listDistributors()
      const published = catalog.some((distributor) => distributor.code === request.distributorCode)
      if (!published) throw companyEnergyDistributorUnknown()
      await input.energy.saveChoice(request)
      return resolveCompanyEnergySettings({
        catalog,
        choice: {
          adjustmentFactor: request.adjustmentFactor,
          distributorCode: request.distributorCode,
        },
      })
    },
  }
}
