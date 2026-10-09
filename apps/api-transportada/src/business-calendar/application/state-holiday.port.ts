/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ManagedHolidayOrigin } from '../domain/business-calendar.types.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

type StateHolidayBase = {
  readonly name: string
  readonly stateIbgeCode: string
}

type OnceFields = { readonly holidayOn: string; readonly recurrence: 'once' }
type YearlyFields = { readonly day: number; readonly month: number; readonly recurrence: 'yearly' }

export type StateHolidayInput = StateHolidayBase & (OnceFields | YearlyFields)

export type StateHolidayRecord = StateHolidayInput & {
  readonly id: string
  readonly origin: ManagedHolidayOrigin
  readonly updatedAt: Date
}

/** A forma (`recurrence`) identifica a união e tem de ser a do feriado gravado. */
export type StateHolidayChanges =
  | { readonly holidayOn?: string; readonly name?: string; readonly recurrence: 'once' }
  | {
      readonly day?: number
      readonly month?: number
      readonly name?: string
      readonly recurrence: 'yearly'
    }

/** `created: false`: o mesmo feriado já existia, e a escrita é a mesma (idempotente). */
export type CreateStateHolidayResult = {
  readonly created: boolean
  readonly holiday: StateHolidayRecord
}

/** Não é materializado: o roteiro não lê feriado estadual, a política expande o `yearly`. */
export type StateHolidayPort = {
  create(input: BusinessCalendarActor & StateHolidayInput): Promise<CreateStateHolidayResult>
  list(input: {
    readonly companyId: string
    readonly stateIbgeCode?: string
  }): Promise<readonly StateHolidayRecord[]>
  /** O importado é desligado (supressão, só de `today` em diante); o digitado é apagado. */
  remove(
    input: BusinessCalendarActor & { readonly id: string; readonly today: string },
  ): Promise<void>
  update(
    input: BusinessCalendarActor & {
      readonly changes: StateHolidayChanges
      readonly id: string
    },
  ): Promise<StateHolidayRecord | null>
}
