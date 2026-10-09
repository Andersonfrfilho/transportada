/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Etapa 3 da rotina (ADR-0100 §5): só banco. Aplica o cache do fornecedor no calendário de cada
 * empresa — municipal e estadual, nunca o nacional (D4) nem o facultativo (D5) — e confere a paridade
 * do nacional. Idempotente: repetir o ciclo não escreve nada. Uma empresa que falha não derruba as outras.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { countNationalMismatch } from '../domain/national-holiday-parity.policy.js'
import { listNationalHolidayDates } from '../domain/national-holiday.policy.js'
import {
  resolveHorizonYears,
  resolveSaoPauloCivilDate,
} from '../domain/holiday-provider-schedule.policy.js'

import type { HolidayApplyStore } from './holiday-apply.port.js'

export type ApplyTally = {
  companies: number
  failedCompanies: number
  municipalInserted: number
  nationalMismatch: number
  stateInserted: number
  unexpectedFailures: number
}

export type ApplyHolidayProviderDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly store: HolidayApplyStore
}

export type ApplyHolidayProviderUseCase = {
  execute(input: {
    readonly correlationId?: string | undefined
    readonly isStopRequested: () => boolean
  }): Promise<ApplyTally>
}

type FailureLog = {
  readonly companyId?: string
  readonly correlationId: string | undefined
  readonly error: unknown
  readonly logger: WorkerLogger
  readonly message: string
}

function logFailure(input: FailureLog): void {
  // O nome do erro, nunca a mensagem: a do banco pode carregar o dado que falhou.
  safeLogError({
    logger: input.logger,
    message: input.message,
    metadata: {
      companyId: input.companyId,
      correlationId: input.correlationId,
      reason: input.error instanceof Error ? input.error.name : 'UnknownError',
    },
  })
}

async function countMismatch(input: {
  readonly correlationId: string | undefined
  readonly dependencies: ApplyHolidayProviderDependencies
  readonly now: Date
  readonly tally: ApplyTally
}): Promise<void> {
  const { correlationId, dependencies, now, tally } = input

  try {
    const byYear = await dependencies.store.readNationalDates({ years: resolveHorizonYears(now) })
    for (const [year, provider] of byYear) {
      tally.nationalMismatch += countNationalMismatch({
        code: listNationalHolidayDates(year),
        provider,
      })
    }
  } catch (error: unknown) {
    tally.unexpectedFailures += 1
    logFailure({
      correlationId,
      error,
      logger: dependencies.logger,
      message: 'holiday_apply_parity_failed',
    })
  }
}

function createEmptyTally(): ApplyTally {
  return {
    companies: 0,
    failedCompanies: 0,
    municipalInserted: 0,
    nationalMismatch: 0,
    stateInserted: 0,
    unexpectedFailures: 0,
  }
}

export function createApplyHolidayProviderUseCase(
  dependencies: ApplyHolidayProviderDependencies,
): ApplyHolidayProviderUseCase {
  const { logger, store } = dependencies

  return {
    async execute({ correlationId, isStopRequested }) {
      const now = dependencies.now()
      const today = resolveSaoPauloCivilDate(now)
      const tally = createEmptyTally()

      for (const companyId of await store.listCompanies()) {
        if (isStopRequested()) break
        tally.companies += 1
        try {
          const result = await store.applyCompany({ companyId, today })
          tally.municipalInserted += result.municipalInserted
          tally.stateInserted += result.stateInserted
        } catch (error: unknown) {
          tally.failedCompanies += 1
          logFailure({
            companyId,
            correlationId,
            error,
            logger,
            message: 'holiday_apply_company_failed',
          })
        }
      }

      await countMismatch({ correlationId, dependencies, now, tally })
      return tally
    },
  }
}
