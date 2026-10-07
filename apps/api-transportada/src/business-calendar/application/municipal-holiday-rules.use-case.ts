/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o caso de uso só decide o relógio (o ano corrente de São Paulo, injetado) e a
 * ausência (editar o que não existe é 404; apagar é no-op). O resto é do repositório, em transação.
 */
import { MunicipalHolidayRuleNotFoundError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import { resolveCurrentYear } from './municipal-holiday-materialization.service.js'
import type {
  CreateMunicipalHolidayRuleResult,
  MaterializationSummary,
  MunicipalHolidayRuleChanges,
  MunicipalHolidayRuleFields,
  MunicipalHolidayRulePort,
  MunicipalHolidayRuleRecord,
} from './municipal-holiday-rule.port.js'

type Dependencies = {
  readonly now: () => Date
  readonly repository: MunicipalHolidayRulePort
}

type Execution<TInput, TResult> = { readonly execute: (input: TInput) => Promise<TResult> }

export type MunicipalHolidayRulesUseCases = {
  readonly create: Execution<
    BusinessCalendarActor & MunicipalHolidayRuleFields,
    CreateMunicipalHolidayRuleResult
  >
  readonly list: Execution<
    { readonly cityIbgeCode?: string; readonly companyId: string },
    readonly MunicipalHolidayRuleRecord[]
  >
  readonly materialize: Execution<BusinessCalendarActor, MaterializationSummary>
  readonly remove: Execution<BusinessCalendarActor & { readonly id: string }, void>
  readonly update: Execution<
    BusinessCalendarActor & {
      readonly changes: MunicipalHolidayRuleChanges
      readonly id: string
    },
    MunicipalHolidayRuleRecord
  >
}

export function createMunicipalHolidayRulesUseCases({
  now,
  repository,
}: Dependencies): MunicipalHolidayRulesUseCases {
  const currentYear = (): number => resolveCurrentYear({ now: now() })

  return {
    create: {
      execute: (input) => repository.create({ ...input, currentYear: currentYear() }),
    },
    list: { execute: (input) => repository.list(input) },
    materialize: {
      execute: (input) => repository.materialize({ ...input, currentYear: currentYear() }),
    },
    remove: { execute: (input) => repository.remove(input) },
    update: {
      execute: async (input) => {
        const updated = await repository.update({ ...input, currentYear: currentYear() })
        if (updated === null) throw new MunicipalHolidayRuleNotFoundError()
        return updated
      },
    },
  }
}
