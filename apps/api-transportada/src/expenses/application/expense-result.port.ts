/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (esqueleto; a T4.5 implementa com Drizzle): o que o resultado do mês lê (ADR-0116 §4). Nada é gravado.
 */
import type {
  AllocatableCostGroup,
  AllocationCriterion,
  AllocationTrip,
  ExpenseCostGroup,
} from '../domain/expense-allocation.policy.js'
import type { ExpenseOccurrenceStatus } from './expense.port.js'

export type ResultOccurrence = {
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
