/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (esqueleto; a T4.5 implementa): o resultado do período, calculado na leitura (ADR-0116 §4, §7).
 */
import type { ExpenseResultPorts } from './expense-result.port.js'

export type ExpenseResultInput = {
  readonly companyId: string
  /** `yyyy-mm-dd`. */
  readonly from: string
  readonly to: string
}

export type ExpenseResultLine = {
  readonly cost: string
  /** Rateio das contas ligadas ao veículo da viagem. */
  readonly generalShare: string
  readonly id: string
  readonly margin: string
  readonly revenue: string
  readonly vehicleShare: string
}

export type ExpenseResult = {
  readonly byCustomer: readonly ExpenseResultLine[]
  readonly byTrip: readonly ExpenseResultLine[]
  readonly byVehicle: readonly ExpenseResultLine[]
  /** Contas sem viagem elegível, sempre à vista (ADR-0116 §6). */
  readonly unallocatedTotal: string
  readonly totals: {
    readonly expensesTotal: string
    readonly profit: string
    readonly revenue: string
    readonly tripCost: string
  }
}

export function createGetExpenseResultUseCase(ports: ExpenseResultPorts): {
  execute(input: ExpenseResultInput): Promise<ExpenseResult>
} {
  void ports
  return {
    execute: () => Promise.reject(new Error('not implemented (spec 325 T4.5)')),
  }
}
