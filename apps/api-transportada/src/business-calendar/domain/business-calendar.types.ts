/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HOLIDAY_ORIGIN,
  HOLIDAY_RECURRENCE,
  MUNICIPAL_HOLIDAY_KIND,
  NationalHolidayKey,
} from './business-calendar.constant.js'

/** Data civil `YYYY-MM-DD`, sem hora e sem fuso: quem converte instante em data é a borda. */
export type CivilDate = string

export type HolidayOccurrence =
  | { readonly date: CivilDate; readonly recurrence: typeof HOLIDAY_RECURRENCE.ONCE }
  | {
      readonly day: number
      readonly month: number
      readonly recurrence: typeof HOLIDAY_RECURRENCE.YEARLY
    }

export type MunicipalHolidayKind =
  (typeof MUNICIPAL_HOLIDAY_KIND)[keyof typeof MUNICIPAL_HOLIDAY_KIND]

export type HolidayOrigin = (typeof HOLIDAY_ORIGIN)[keyof typeof HOLIDAY_ORIGIN]

/** O que a gestão distingue numa linha da empresa: importada do fornecedor ou do operador (gerada por regra inclusive). */
export type ManagedHolidayOrigin = Extract<
  HolidayOrigin,
  typeof HOLIDAY_ORIGIN.IMPORTED | typeof HOLIDAY_ORIGIN.TYPED
>

export type MunicipalHolidayRule = {
  readonly cityIbgeCode: string
  readonly kind: MunicipalHolidayKind
  readonly name: string
  readonly occurrence: HolidayOccurrence
  /** Ausente: regra montada à mão, que vale como digitada. */
  readonly origin?: HolidayOrigin
}

export type StateHolidayRule = {
  readonly name: string
  readonly occurrence: HolidayOccurrence
  /** Ausente: regra montada à mão, que vale como digitada. */
  readonly origin?: HolidayOrigin
  /** Dois dígitos: o prefixo do código IBGE das cidades daquela UF. */
  readonly stateIbgeCode: string
}

export type NationalHoliday = {
  readonly date: CivilDate
  readonly key: NationalHolidayKey
}

/** O nome nacional é do locale; o estadual e o municipal são do cadastro. */
export type HolidayReason =
  | {
      readonly key: NationalHolidayKey
      readonly origin: HolidayOrigin
      readonly source: 'national'
    }
  | { readonly name: string; readonly origin: HolidayOrigin; readonly source: 'state' }
  | {
      readonly kind: MunicipalHolidayKind
      readonly name: string
      readonly origin: HolidayOrigin
      readonly source: 'municipal'
    }

export type BusinessCalendarCoverage = {
  readonly fromYear: number
  readonly toYear: number
}

export type BusinessCalendar = {
  readonly cityIbgeCode: string
  readonly coverage: BusinessCalendarCoverage
  readonly reasonsByDate: ReadonlyMap<CivilDate, readonly HolidayReason[]>
  readonly saturdayIsBusinessDay: boolean
}

export type BuildBusinessCalendarParams = {
  readonly cityIbgeCode: string
  readonly coverage: BusinessCalendarCoverage
  readonly municipalRules: readonly MunicipalHolidayRule[]
  readonly saturdayIsBusinessDay: boolean
  readonly stateRules: readonly StateHolidayRule[]
}

export type CalendarDateParams = {
  readonly calendar: BusinessCalendar
  readonly date: CivilDate
}

export type ExplainDayResult = {
  readonly isBusinessDay: boolean
  readonly reasons: readonly HolidayReason[]
  readonly weekend: 'saturday' | 'sunday' | null
}

export type AddBusinessDaysParams = {
  readonly calendar: BusinessCalendar
  readonly days: number
  readonly start: CivilDate
}

export type AddBusinessDaysResult = {
  readonly date: CivilDate
  /** A data inicial quando útil; senão, o primeiro dia útil depois dela. */
  readonly dayZero: CivilDate
}

export type CountBusinessDaysParams = {
  readonly calendar: BusinessCalendar
  readonly from: CivilDate
  readonly to: CivilDate
}

export type CountBusinessDaysResult = {
  readonly businessDays: number
}
