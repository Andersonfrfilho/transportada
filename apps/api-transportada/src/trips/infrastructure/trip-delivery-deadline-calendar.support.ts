/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: os calendários das cidades de UMA viagem — as quatro leituras de regras uma vez só
 * (em série, o `queryable` pode ser transação) e um `buildBusinessCalendar` por cidade. Calendário que a
 * política recusa não derruba a viagem: a cidade fica de fora, com o código da recusa.
 */
import { loadBusinessCalendarRules } from '../../business-calendar/infrastructure/business-calendar-rules.query.js'
import { buildBusinessCalendar } from '../../business-calendar/domain/business-calendar-build.policy.js'
import { BusinessCalendarError } from '../../business-calendar/domain/business-calendar.error.js'
import type {
  BusinessCalendar,
  BusinessCalendarCoverage,
} from '../../business-calendar/domain/business-calendar.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O calendário da cidade, ou o código com que a política o recusou (`BUSINESS_CALENDAR_*`). */
export type CityCalendar =
  | { readonly calendar: BusinessCalendar }
  | { readonly refusalCode: string }

export async function loadCityCalendars(
  queryable: TripQueryable,
  params: {
    readonly cityCodes: readonly string[]
    readonly companyId: string
    readonly coverage: BusinessCalendarCoverage
  },
): Promise<ReadonlyMap<string, CityCalendar>> {
  const { cityCodes, companyId, coverage } = params
  const rules = await loadBusinessCalendarRules(queryable, { cityCodes, companyId, coverage })
  const cityCalendars = new Map<string, CityCalendar>()
  for (const cityIbgeCode of cityCodes) {
    try {
      cityCalendars.set(cityIbgeCode, {
        calendar: buildBusinessCalendar({ ...rules, cityIbgeCode, coverage }),
      })
    } catch (error) {
      if (!(error instanceof BusinessCalendarError)) throw error
      cityCalendars.set(cityIbgeCode, { refusalCode: error.code })
    }
  }
  return cityCalendars
}
