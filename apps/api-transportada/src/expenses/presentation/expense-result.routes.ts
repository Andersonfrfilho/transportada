/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (esqueleto; a T4.5 implementa): rotas de leitura do resultado, do custo por km (RF17) e da
 * configuração de rateio. Leitura pede `expenses.read`; trocar o critério pede `expenses.manage`.
 */
import type { defineRoute } from '../../http/router.service.js'
import type { ExpenseResult, ExpenseResultInput } from '../application/expense-result.use-case.js'
import type {
  AllocatableCostGroup,
  AllocationCriterion,
} from '../domain/expense-allocation.policy.js'

type UseCase<Input, Output> = { execute(input: Input): Promise<Output> }
type SettingsMap = Readonly<Record<AllocatableCostGroup, AllocationCriterion>>

export type ExpenseResultRoutesDependencies = {
  readonly getResult: UseCase<ExpenseResultInput, ExpenseResult>
  readonly getSettings: UseCase<{ companyId: string }, SettingsMap>
  readonly getUnitCosts: UseCase<ExpenseResultInput, unknown>
  readonly updateSettings: UseCase<
    { companyId: string; settings: Partial<SettingsMap>; updatedBy: string },
    SettingsMap
  >
}

export function createExpenseResultRoutes(
  dependencies: ExpenseResultRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  void dependencies
  return []
}
