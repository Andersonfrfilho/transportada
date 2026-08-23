/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { desc, eq, sql } from 'drizzle-orm'

import { companyEnergySettings } from '../../database/company-energy-settings.schema.js'
import { energyTariffReferences } from '../../database/energy-tariff.schema.js'
import type {
  CompanyEnergyChoiceInput,
  CompanyEnergyPort,
} from '../application/company-energy.port.js'
import type { CompanyEnergyChoice, EnergyDistributor } from '../domain/company-energy.policy.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

export class DrizzleCompanyEnergyRepository implements CompanyEnergyPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async loadChoice(input: { readonly companyId: string }): Promise<CompanyEnergyChoice> {
    const [choice] = await this.database
      .select({
        adjustmentFactor: companyEnergySettings.adjustmentFactor,
        distributorCode: companyEnergySettings.distributorCode,
      })
      .from(companyEnergySettings)
      .where(eq(companyEnergySettings.companyId, input.companyId))
      .limit(1)
    return choice ?? null
  }

  /** A empresa tem uma distribuidora, não uma lista: trocar é reescrever a linha dela. */
  public async saveChoice(input: CompanyEnergyChoiceInput): Promise<void> {
    await this.database
      .insert(companyEnergySettings)
      .values({
        adjustmentFactor: input.adjustmentFactor,
        companyId: input.companyId,
        distributorCode: input.distributorCode,
      })
      .onConflictDoUpdate({
        set: {
          adjustmentFactor: input.adjustmentFactor,
          distributorCode: input.distributorCode,
          updatedAt: sql`now()`,
        },
        target: [companyEnergySettings.companyId],
      })
  }

  public async clearChoice(input: { readonly companyId: string }): Promise<void> {
    await this.database
      .delete(companyEnergySettings)
      .where(eq(companyEnergySettings.companyId, input.companyId))
  }

  /**
   * Uma opção por distribuidora, nomeada pelo CNPJ da publicação mais recente, e em ordem estável:
   * a tabela tem uma linha por vigência e por recorte, e lista que muda de ordem entre duas leituras
   * faz o operador procurar de novo o que já tinha achado.
   */
  public async listDistributors(): Promise<readonly EnergyDistributor[]> {
    return this.database
      .selectDistinctOn([energyTariffReferences.distributorCode], {
        code: energyTariffReferences.distributorCode,
        taxId: energyTariffReferences.distributorTaxId,
      })
      .from(energyTariffReferences)
      .orderBy(energyTariffReferences.distributorCode, desc(energyTariffReferences.effectiveFrom))
  }
}
