/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, between, eq, inArray, isNull, or } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { companyBusinessCalendarSettings } from '../../database/company-business-calendar-settings.schema.js'
import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import { stateHolidays } from '../../database/state-holiday.schema.js'
import type {
  BusinessCalendarRulesPort,
  LoadBusinessCalendarRulesParams,
  LoadedBusinessCalendarRules,
} from '../application/business-calendar-rules.port.js'
import {
  BUSINESS_CALENDAR_MAX_RULES,
  HOLIDAY_RECURRENCE,
  STATE_IBGE_CODE_LENGTH,
} from '../domain/business-calendar.constant.js'
import { formatCivilDate } from '../domain/civil-date.policy.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import {
  toOnceMunicipalRule,
  toStateRule,
  toYearlyMunicipalRule,
} from './business-calendar-rule.mapper.js'

/** Cada consulta pede um a mais que o teto de regras: a política recusa o excesso (`TOO_MANY_RULES`). */
export class DrizzleBusinessCalendarRepository implements BusinessCalendarRulesPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async loadRules(
    params: LoadBusinessCalendarRulesParams,
  ): Promise<LoadedBusinessCalendarRules> {
    const { cityCodes, companyId } = params
    const stateCodes = [...new Set(cityCodes.map((code) => code.slice(0, STATE_IBGE_CODE_LENGTH)))]
    const hasCities = cityCodes.length > 0

    // `Promise.all` de propósito: calendário parcial é prazo errado, então falhar é o comportamento certo.
    const [ruleRows, holidayRows, stateRows, [settings]] = await Promise.all([
      hasCities ? this.readRules({ cityCodes, companyId }) : [],
      hasCities ? this.readTypedHolidays(params) : [],
      hasCities ? this.readStateHolidays({ ...params, stateCodes }) : [],
      this.database
        .select()
        .from(companyBusinessCalendarSettings)
        .where(eq(companyBusinessCalendarSettings.companyId, companyId))
        .limit(1),
    ])

    return {
      municipalRules: [
        ...ruleRows.map(toYearlyMunicipalRule),
        ...holidayRows.map(toOnceMunicipalRule),
      ],
      saturdayIsBusinessDay: settings?.saturdayIsBusinessDay ?? false,
      stateRules: stateRows.map(toStateRule),
    }
  }

  private readRules(input: { readonly cityCodes: readonly string[]; readonly companyId: string }) {
    return this.database
      .select()
      .from(municipalHolidayRules)
      .where(
        and(
          eq(municipalHolidayRules.companyId, input.companyId),
          inArray(municipalHolidayRules.cityIbgeCode, [...input.cityCodes]),
        ),
      )
      .limit(BUSINESS_CALENDAR_MAX_RULES + 1)
  }

  /** `source_rule_id` nulo: a gerada é a regra de novo, e a política já a expande por ano. */
  private readTypedHolidays(params: LoadBusinessCalendarRulesParams) {
    const { fromYear, toYear } = params.coverage
    return this.database
      .select()
      .from(municipalHolidays)
      .where(
        and(
          eq(municipalHolidays.companyId, params.companyId),
          inArray(municipalHolidays.cityIbgeCode, [...params.cityCodes]),
          isNull(municipalHolidays.sourceRuleId),
          between(
            municipalHolidays.holidayOn,
            formatCivilDate({ day: 1, month: 1, year: fromYear }),
            formatCivilDate({ day: 31, month: 12, year: toYear }),
          ),
        ),
      )
      .limit(BUSINESS_CALENDAR_MAX_RULES + 1)
  }

  private readStateHolidays(
    params: LoadBusinessCalendarRulesParams & { readonly stateCodes: readonly string[] },
  ) {
    const { fromYear, toYear } = params.coverage
    return this.database
      .select()
      .from(stateHolidays)
      .where(
        and(
          eq(stateHolidays.companyId, params.companyId),
          inArray(stateHolidays.stateIbgeCode, [...params.stateCodes]),
          or(
            eq(stateHolidays.recurrence, HOLIDAY_RECURRENCE.YEARLY),
            and(
              eq(stateHolidays.recurrence, HOLIDAY_RECURRENCE.ONCE),
              between(
                stateHolidays.holidayOn,
                formatCivilDate({ day: 1, month: 1, year: fromYear }),
                formatCivilDate({ day: 31, month: 12, year: toYear }),
              ),
            ),
          ),
        ),
      )
      .limit(BUSINESS_CALENDAR_MAX_RULES + 1)
  }
}
