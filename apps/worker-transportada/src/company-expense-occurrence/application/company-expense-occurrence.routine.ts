/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  civilDateInSaoPaulo,
  listExpenseCompetenceWindow,
  resolveExpenseSlots,
} from '../domain/expense-schedule.policy.js'
import type { CompanyExpenseOccurrencePorts } from './company-expense-occurrence.port.js'

export type CompanyExpenseOccurrenceRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly ports: CompanyExpenseOccurrencePorts
}

/**
 * Spec 325 T1.5 (RF4): gera, por empresa, as ocorrências das contas fixas ativas (mês corrente + 3). Idempotente
 * pela chave `(conta, competência, slot)`: rodar duas vezes, ou em duas réplicas, não duplica nada. Uma empresa que
 * falha não segura as outras — o ciclo as termina e só depois acusa, para o relógio ver a execução falha.
 */
export function createCompanyExpenseOccurrenceRoutine(
  dependencies: CompanyExpenseOccurrenceRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: CompanyExpenseOccurrenceRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const today = civilDateInSaoPaulo(dependencies.now())
  const window = listExpenseCompetenceWindow(today)
  const companyIds = await dependencies.ports.listCompaniesWithActiveFixed()
  let created = 0
  let failedCompanies = 0
  let processedCompanies = 0

  for (const companyId of companyIds) {
    if (context.isStopRequested()) break
    try {
      const expenses = await dependencies.ports.listActiveFixed({ companyId })
      for (const expense of expenses) {
        for (const competence of window) {
          const slots = resolveExpenseSlots({
            anchorCompetence: expense.anchorCompetence,
            competence,
            dueDay: expense.dueDay,
            recurrence: expense.recurrence,
          })
          for (const { dueDate, slot } of slots) {
            const inserted = await dependencies.ports.insertIfAbsent({
              companyId: expense.companyId,
              competence,
              dueDate,
              expectedAmount: expense.expectedAmount,
              expenseId: expense.id,
              slot,
            })
            if (inserted) created += 1
          }
        }
      }
      processedCompanies += 1
    } catch (error: unknown) {
      failedCompanies += 1
      safeLogWarn({
        logger: dependencies.logger,
        message: 'company_expense_occurrence_company_failed',
        metadata: {
          companyId,
          correlationId: context.correlationId,
          error: error instanceof Error ? error.message : 'unknown',
          executionId: context.executionId,
        },
      })
    }
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'company_expense_occurrence_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      created,
      executionId: context.executionId,
      failedCompanies,
      processedCompanies,
      today,
    },
  })

  // Falha parcial vira erro do ciclo: o invólucro a grava como `unexpected_error` e o painel mostra a execução falha.
  if (failedCompanies > 0) {
    throw new Error(`company expense occurrences failed for ${failedCompanies} company(ies)`)
  }
  return { counters: { companies: processedCompanies, created }, outcome: 'succeeded' }
}
