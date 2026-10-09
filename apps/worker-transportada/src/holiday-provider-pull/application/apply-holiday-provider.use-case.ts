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

export function createApplyHolidayProviderUseCase(
  dependencies: ApplyHolidayProviderDependencies,
): ApplyHolidayProviderUseCase {
  const { logger, store } = dependencies

  function logFailure(input: {
    readonly correlationId: string | undefined
    readonly error: unknown
    readonly message: string
    readonly companyId?: string
  }): void {
    // O nome do erro, nunca a mensagem: a do banco pode carregar o dado que falhou.
    safeLogError({
      logger,
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
    readonly now: Date
    readonly tally: ApplyTally
  }): Promise<void> {
    try {
      const byYear = await store.readNationalDates({ years: resolveHorizonYears(input.now) })
      for (const [year, provider] of byYear) {
        input.tally.nationalMismatch += countNationalMismatch({
          code: listNationalHolidayDates(year),
          provider,
        })
      }
    } catch (error: unknown) {
      input.tally.unexpectedFailures += 1
      logFailure({
        correlationId: input.correlationId,
        error,
        message: 'holiday_apply_parity_failed',
      })
    }
  }

  return {
    async execute({ correlationId, isStopRequested }) {
      const now = dependencies.now()
      const today = resolveSaoPauloCivilDate(now)
      const tally: ApplyTally = {
        companies: 0,
        failedCompanies: 0,
        municipalInserted: 0,
        nationalMismatch: 0,
        stateInserted: 0,
        unexpectedFailures: 0,
      }

      for (const companyId of await store.listCompanies()) {
        if (isStopRequested()) break
        tally.companies += 1
        try {
          const result = await store.applyCompany({ companyId, today })
          tally.municipalInserted += result.municipalInserted
          tally.stateInserted += result.stateInserted
        } catch (error: unknown) {
          tally.failedCompanies += 1
          logFailure({ companyId, correlationId, error, message: 'holiday_apply_company_failed' })
        }
      }

      await countMismatch({ correlationId, now, tally })
      return tally
    },
  }
}
