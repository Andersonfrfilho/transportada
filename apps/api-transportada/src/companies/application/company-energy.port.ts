/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyEnergyChoice, EnergyDistributor } from '../domain/company-energy.policy.js'

export type CompanyEnergyChoiceInput = {
  readonly adjustmentFactor: string
  readonly companyId: string
  readonly distributorCode: string
}

export type CompanyEnergyPort = {
  clearChoice(input: { readonly companyId: string }): Promise<void>
  /**
   * Toda distribuidora que a coleta já publicou, e não só as de vigência aberta: vigência fechada é
   * republicada na homologação seguinte, e escondê-la faria o operador esperar uma coleta para
   * configurar o que ele já sabe. Uma consulta serve o catálogo da tela e a conferência do `PUT`.
   */
  listDistributors(): Promise<readonly EnergyDistributor[]>
  loadChoice(input: { readonly companyId: string }): Promise<CompanyEnergyChoice>
  saveChoice(input: CompanyEnergyChoiceInput): Promise<void>
}
