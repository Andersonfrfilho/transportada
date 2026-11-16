/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF21 a RF23, ADR-0116 §7): o que a previsão e o fora do padrão leem além do resultado. Nada é gravado,
 * exceto o limite do alerta (`company_expense_allocation_settings`), que é por empresa.
 */
import type { ExpenseResultPorts } from './expense-result.port.js'

export type ExpenseForecastPorts = ExpenseResultPorts & {
  readonly calendar: {
    /** Dias úteis de cada mês `yyyy-mm`, pelo calendário da empresa (cidade do perfil fiscal, sábado conforme o ajuste). */
    businessDaysByMonth(input: {
      companyId: string
      months: readonly string[]
    }): Promise<ReadonlyMap<string, number>>
  }
  readonly labels: {
    categoryNames(input: { companyId: string }): Promise<ReadonlyMap<string, string>>
    vehiclePlates(input: {
      companyId: string
      vehicleIds: readonly string[]
    }): Promise<ReadonlyMap<string, string>>
  }
}

export type ExpenseOutOfPatternSettingsPorts = {
  readonly outOfPatternSettings: {
    /** O limite em pontos percentuais; sem linha, o padrão (10). */
    get(input: { companyId: string }): Promise<number>
    save(input: {
      companyId: string
      correlationId: string
      thresholdPercent: number
      updatedBy: string
    }): Promise<number>
  }
}
