/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2a: as leituras que alimentam `buildBusinessCalendar`, tiradas do repositório para
 * aceitar o executor de quem chama. O detalhe da viagem roda dentro de transação nos caminhos de
 * escrita, e consulta concorrente numa transação do Bun SQL pode nunca voltar: aqui é tudo em série.
 */
import { and, between, eq, inArray, isNull, or } from 'drizzle-orm'

import { companyBusinessCalendarSettings } from '../../database/company-business-calendar-settings.schema.js'
import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import { stateHolidays } from '../../database/state-holiday.schema.js'
import type {
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

/** Banco ou transação: só o `select` importa. */
export type BusinessCalendarRulesExecutor = Pick<BusinessCalendarDatabase, 'select'>

type CitiesParams = { readonly cityCodes: readonly string[]; readonly companyId: string }

type StatesParams = LoadBusinessCalendarRulesParams & { readonly stateCodes: readonly string[] }

/** Cada consulta pede um a mais que o teto de regras: a política recusa o excesso (`TOO_MANY_RULES`). */
function readYearlyRules(executor: BusinessCalendarRulesExecutor, params: CitiesParams) {
  return executor
    .select()
    .from(municipalHolidayRules)
    .where(
      and(
        eq(municipalHolidayRules.companyId, params.companyId),
        inArray(municipalHolidayRules.cityIbgeCode, [...params.cityCodes]),
      ),
    )
    .limit(BUSINESS_CALENDAR_MAX_RULES + 1)
}

/** `source_rule_id` nulo: a gerada é a regra de novo, e a política já a expande por ano. */
function readTypedHolidays(
  executor: BusinessCalendarRulesExecutor,
  params: LoadBusinessCalendarRulesParams,
) {
  const { fromYear, toYear } = params.coverage
  return executor
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

function readStateHolidays(executor: BusinessCalendarRulesExecutor, params: StatesParams) {
  const { fromYear, toYear } = params.coverage
  return executor
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

function readSettings(executor: BusinessCalendarRulesExecutor, companyId: string) {
  return executor
    .select()
    .from(companyBusinessCalendarSettings)
    .where(eq(companyBusinessCalendarSettings.companyId, companyId))
    .limit(1)
}

export async function loadBusinessCalendarRules(
  executor: BusinessCalendarRulesExecutor,
  params: LoadBusinessCalendarRulesParams,
): Promise<LoadedBusinessCalendarRules> {
  const { cityCodes, companyId } = params
  const stateCodes = [...new Set(cityCodes.map((code) => code.slice(0, STATE_IBGE_CODE_LENGTH)))]
  const hasCities = cityCodes.length > 0

  // Em série, não em paralelo: calendário parcial é prazo errado, e a transação não aceita concorrência.
  const ruleRows = hasCities ? await readYearlyRules(executor, { cityCodes, companyId }) : []
  const holidayRows = hasCities ? await readTypedHolidays(executor, params) : []
  const stateRows = hasCities ? await readStateHolidays(executor, { ...params, stateCodes }) : []
  const [settings] = await readSettings(executor, companyId)

  return {
    municipalRules: [
      ...ruleRows.map(toYearlyMunicipalRule),
      ...holidayRows.map(toOnceMunicipalRule),
    ],
    saturdayIsBusinessDay: settings?.saturdayIsBusinessDay ?? false,
    stateRules: stateRows.map(toStateRule),
  }
}
