/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (portas; a T4.5 as implementa com Drizzle): o que o resultado do mês lê (ADR-0116 §4). Nada é gravado.
 */
import type {
  AllocatableCostGroup,
  AllocationCriterion,
  AllocationTrip,
  ExpenseCostGroup,
} from '../domain/expense-allocation.policy.js'
import type { ExpenseOccurrenceStatus } from './expense.port.js'

export type ResultOccurrence = {
  readonly categoryId: string
  readonly costGroup: ExpenseCostGroup
  readonly expectedAmount: string
  readonly expenseId: string
  /** Soma das viagens incluídas no pagamento de motorista (`company_expense_occurrence_trips`). */
  readonly includedTripsAmount: string
  readonly name: string
  readonly occurrenceId: string
  readonly paidAmount: string | null
  readonly payeeDriverId: string | null
  readonly status: ExpenseOccurrenceStatus
  readonly vehicleId: string | null
}

export type ExpenseResultPorts = {
  readonly allocationSettings: {
    get(input: {
      companyId: string
    }): Promise<Partial<Record<AllocatableCostGroup, AllocationCriterion>>>
  }
  readonly occurrences: {
    /** Ocorrências cuja competência cai no período (`from`/`to` em `yyyy-mm-dd`), de qualquer estado. */
    listForPeriod(input: {
      companyId: string
      from: string
      to: string
    }): Promise<readonly ResultOccurrence[]>
  }
  readonly trips: {
    /** Viagens `completed` cuja conclusão (a mesma do pagamento, T1.4b) cai no período. */
    listCompleted(input: {
      companyId: string
      from: string
      to: string
    }): Promise<readonly AllocationTrip[]>
  }
}

/** Configuração do critério de rateio da empresa (RF11, RF16). Só a leitura entra no cálculo; a troca é auditada. */
export type ExpenseAllocationSettingsPorts = {
  readonly allocationSettings: ExpenseResultPorts['allocationSettings'] & {
    save(input: {
      companyId: string
      correlationId: string
      settings: Partial<Record<AllocatableCostGroup, AllocationCriterion>>
      updatedBy: string
    }): Promise<Partial<Record<AllocatableCostGroup, AllocationCriterion>>>
  }
}

/** Nomes que a exportação mostra no lugar dos ids (T4.6). Só leitura, sempre por empresa. */
export type ExpenseExportLabels = {
  readonly categoryName: string | null
  readonly companyName: string
  readonly customers: ReadonlyMap<string, string>
  readonly payeeName: string | null
  readonly vehicles: ReadonlyMap<string, string>
}

export type ExpenseExportPorts = {
  readonly exportAudit: {
    /** Exportar é ler dado financeiro da empresa e sair com ele: fica no diário (010). */
    record(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly filters: Readonly<Record<string, string>>
      readonly format: 'csv' | 'pdf'
      readonly from: string
      readonly to: string
      readonly userId: string
    }): Promise<void>
  }
  readonly exportLabels: {
    read(input: {
      readonly categoryId?: string
      readonly companyId: string
      readonly customerIds: readonly string[]
      readonly payeeDriverId?: string
      readonly vehicleIds: readonly string[]
    }): Promise<ExpenseExportLabels>
  }
}
