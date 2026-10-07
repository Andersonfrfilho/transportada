/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { StateHolidayNotFoundError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import type {
  CreateStateHolidayResult,
  StateHolidayChanges,
  StateHolidayInput,
  StateHolidayPort,
  StateHolidayRecord,
} from './state-holiday.port.js'

type Execution<TInput, TResult> = { readonly execute: (input: TInput) => Promise<TResult> }

export type StateHolidaysUseCases = {
  readonly create: Execution<BusinessCalendarActor & StateHolidayInput, CreateStateHolidayResult>
  readonly list: Execution<
    { readonly companyId: string; readonly stateIbgeCode?: string },
    readonly StateHolidayRecord[]
  >
  readonly remove: Execution<BusinessCalendarActor & { readonly id: string }, void>
  readonly update: Execution<
    BusinessCalendarActor & { readonly changes: StateHolidayChanges; readonly id: string },
    StateHolidayRecord
  >
}

export function createStateHolidaysUseCases(dependencies: {
  readonly repository: StateHolidayPort
}): StateHolidaysUseCases {
  const { repository } = dependencies

  return {
    create: { execute: (input) => repository.create(input) },
    list: { execute: (input) => repository.list(input) },
    remove: { execute: (input) => repository.remove(input) },
    update: {
      execute: async (input) => {
        const updated = await repository.update(input)
        if (updated === null) throw new StateHolidayNotFoundError()
        return updated
      },
    },
  }
}
