/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { MunicipalHolidayNotFoundError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import { resolveToday } from './civil-date.service.js'
import { resolveCurrentYear } from './municipal-holiday-materialization.service.js'
import type {
  MunicipalHoliday,
  MunicipalHolidayChanges,
  MunicipalHolidayPort,
  SaveMunicipalHolidayInput,
  SaveMunicipalHolidayResult,
} from './municipal-holiday.port.js'

type Dependencies = {
  readonly now: () => Date
  readonly repository: MunicipalHolidayPort
}

type Execution<TInput, TResult> = { readonly execute: (input: TInput) => Promise<TResult> }

export type MunicipalHolidaysUseCases = {
  readonly list: Execution<
    {
      readonly cityIbgeCode?: string
      readonly companyId: string
      readonly from?: string
      readonly to?: string
    },
    readonly MunicipalHoliday[]
  >
  readonly remove: Execution<BusinessCalendarActor & { readonly id: string }, void>
  readonly save: Execution<SaveMunicipalHolidayInput, SaveMunicipalHolidayResult>
  readonly update: Execution<
    BusinessCalendarActor & { readonly changes: MunicipalHolidayChanges; readonly id: string },
    MunicipalHoliday
  >
}

export function createMunicipalHolidaysUseCases({
  now,
  repository,
}: Dependencies): MunicipalHolidaysUseCases {
  return {
    list: { execute: (input) => repository.list(input) },
    remove: {
      execute: (input) => {
        const instant = now()
        return repository.remove({
          ...input,
          currentYear: resolveCurrentYear({ now: instant }),
          today: resolveToday({ now: instant }),
        })
      },
    },
    save: { execute: (input) => repository.save(input) },
    update: {
      execute: async (input) => {
        const updated = await repository.update(input)
        if (updated === null) throw new MunicipalHolidayNotFoundError()
        return updated
      },
    },
  }
}
