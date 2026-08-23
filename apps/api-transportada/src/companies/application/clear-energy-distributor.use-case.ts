/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Sem distribuidora escolhida não há tarifa, e o elétrico volta a ser preço ausente — que é
 * diferente de preço zero, e é o que a tela mostra.
 */
import type { CompanyEnergyPort } from './company-energy.port.js'

export function createClearEnergyDistributorUseCase(input: {
  readonly energy: CompanyEnergyPort
}): {
  readonly execute: (request: { readonly companyId: string }) => Promise<void>
} {
  return {
    execute: (request) => input.energy.clearChoice(request),
  }
}
