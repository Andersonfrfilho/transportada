/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: o que o banco recusa e o que ele aceita nas regras, nas datas materializadas, no
 * feriado estadual e na configuração de sábado.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const CAMPINAS = '3509502'
const HORIZON_YEAR = 2036

export type CalendarFixture = {
  readonly companyId: string
  readonly database: SQL
  readonly otherCompanyId: string
}

type RuleValues = {
  readonly cityIbgeCode?: string
  readonly companyId?: string
  readonly day?: number
  readonly kind?: string
  readonly month?: number
  readonly name?: string
}

export async function insertRule(
  fixture: CalendarFixture,
  values: RuleValues = {},
): Promise<string> {
  const [row] = await fixture.database<Array<{ readonly id: string }>>`
    insert into municipal_holiday_rules
      (company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
    values (${values.companyId ?? fixture.companyId}, ${values.cityIbgeCode ?? CAMPINAS},
      ${values.month ?? 7}, ${values.day ?? 14}, ${values.kind ?? 'city_anniversary'},
      ${values.name ?? 'Aniversário de Campinas'}, ${HORIZON_YEAR})
    returning id
  `
  if (row === undefined) throw new Error('rule was not inserted')
  return row.id
}

export async function assertRuleConstraints(fixture: CalendarFixture): Promise<void> {
  const rejected = (values: RuleValues, constraint: string, code = CHECK_VIOLATION) =>
    expectQueryToFail(insertRule(fixture, values), code, `municipal_holiday_rules_${constraint}`)

  for (const cityIbgeCode of ['350950', '35095021', '0509502', '6509502', '3A09502', '']) {
    await rejected({ cityIbgeCode }, 'city_check')
  }
  for (const cityIbgeCode of ['3409502', '1009502', '5409502']) {
    await rejected({ cityIbgeCode }, 'state_check')
  }
  for (const [month, day] of [
    [13, 1],
    [0, 1],
    [1, 0],
    [4, 31],
    [6, 31],
    [9, 31],
    [11, 31],
    [2, 30],
    [1, 32],
  ] as const) {
    await rejected({ day, month }, 'month_day_check')
  }
  await rejected({ kind: 'feast' }, 'kind_check')
  await rejected({ name: '' }, 'name_check')
  await rejected({ name: 'x'.repeat(121) }, 'name_check')

  await insertRule(fixture, { day: 29, month: 2, name: 'x'.repeat(120) })
  await insertRule(fixture, { day: 30, month: 4, kind: 'holiday' })
  await insertRule(fixture, { day: 31, month: 12, cityIbgeCode: '1100015' })
  await insertRule(fixture, { cityIbgeCode: '5300108', day: 31, month: 1 })

  await rejected(
    { day: 29, month: 2, name: 'outro nome' },
    'company_city_day_unique',
    UNIQUE_VIOLATION,
  )
  await insertRule(fixture, { companyId: fixture.otherCompanyId, day: 29, month: 2 })
}

export async function assertMaterializedHolidays(fixture: CalendarFixture): Promise<void> {
  const { companyId, database, otherCompanyId } = fixture
  const insertHoliday = (values: {
    readonly companyId?: string
    readonly day: string
    readonly kind?: string
    readonly sourceRuleId?: string | null
  }) => database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, kind, source_rule_id)
    values (${values.companyId ?? companyId}, ${CAMPINAS}, ${values.day}, 'Feriado',
      ${values.kind ?? 'holiday'}, ${values.sourceRuleId ?? null})
  `

  await database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name)
    values (${companyId}, ${CAMPINAS}, '2026-09-20', 'Digitada como antes, sem tipo nem origem')
  `
  const [legacy] = await database<
    Array<{ readonly kind: string; readonly source_rule_id: string | null }>
  >`
    select kind, source_rule_id from municipal_holidays where holiday_on = '2026-09-20' and company_id = ${companyId}
  `
  expect(legacy).toEqual({ kind: 'holiday', source_rule_id: null })

  await expectQueryToFail(
    insertHoliday({ day: '2026-09-21', kind: 'feast' }),
    CHECK_VIOLATION,
    'municipal_holidays_kind_check',
  )

  const otherCompanyRule = await insertRule(fixture, {
    companyId: otherCompanyId,
    day: 3,
    month: 3,
  })
  await expectQueryToFail(
    insertHoliday({ day: '2026-03-03', sourceRuleId: otherCompanyRule }),
    FOREIGN_KEY_VIOLATION,
    'municipal_holidays_company_source_rule_fk',
  )

  const ruleId = await insertRule(fixture, { day: 8, month: 8 })
  for (const day of ['2026-08-08', '2027-08-08']) {
    await insertHoliday({ day, kind: 'city_anniversary', sourceRuleId: ruleId })
  }
  await expectQueryToFail(
    insertHoliday({ day: '2026-09-20', kind: 'city_anniversary', sourceRuleId: ruleId }),
    UNIQUE_VIOLATION,
    'municipal_holidays_company_city_day_unique',
  )

  await database`delete from municipal_holiday_rules where id = ${ruleId}`
  const remaining = await database<Array<{ readonly holiday_on: string }>>`
    select holiday_on::text from municipal_holidays where company_id = ${companyId} order by holiday_on
  `
  expect(remaining.map((row) => row.holiday_on)).toEqual(['2026-09-20'])
}

type StateHolidayValues = {
  readonly day?: number | null
  readonly holidayOn?: string | null
  readonly month?: number | null
  readonly name?: string
  readonly recurrence?: string
  readonly stateIbgeCode?: string
}

function insertStateHoliday(fixture: CalendarFixture, values: StateHolidayValues) {
  return fixture.database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, month, day, name)
    values (${fixture.companyId}, ${values.stateIbgeCode ?? '35'}, ${values.recurrence ?? 'once'},
      ${values.holidayOn ?? null}, ${values.month ?? null}, ${values.day ?? null},
      ${values.name ?? 'Revolução Constitucionalista'})
  `
}

export async function assertStateHolidayConstraints(fixture: CalendarFixture): Promise<void> {
  const rejected = (values: StateHolidayValues, constraint: string, code = CHECK_VIOLATION) =>
    expectQueryToFail(insertStateHoliday(fixture, values), code, `state_holidays_${constraint}`)
  const yearly = (month: number | null, day: number | null) => ({
    day,
    month,
    recurrence: 'yearly',
  })

  await rejected({ recurrence: 'weekly' }, 'recurrence_check')
  await rejected({ stateIbgeCode: '99', holidayOn: '2026-07-09' }, 'state_check')
  await rejected({ stateIbgeCode: '3', holidayOn: '2026-07-09' }, 'state_check')
  await rejected({ name: '', holidayOn: '2026-07-09' }, 'name_check')
  await rejected({ name: 'x'.repeat(121), holidayOn: '2026-07-09' }, 'name_check')
  await rejected({}, 'shape_check')
  await rejected({ holidayOn: '2026-07-09', month: 7 }, 'shape_check')
  await rejected({ day: 9, holidayOn: '2026-07-09' }, 'shape_check')
  await rejected({ ...yearly(7, 9), holidayOn: '2026-07-09' }, 'shape_check')
  await rejected(yearly(null, null), 'shape_check')
  await rejected(yearly(7, null), 'shape_check')
  await rejected(yearly(null, 9), 'shape_check')
  await rejected(yearly(13, 1), 'shape_check')
  await rejected(yearly(4, 31), 'shape_check')
  await rejected(yearly(2, 30), 'shape_check')
  await rejected(yearly(1, 0), 'shape_check')

  await insertStateHoliday(fixture, { holidayOn: '2026-07-09' })
  await insertStateHoliday(fixture, yearly(2, 29))
  await insertStateHoliday(fixture, { ...yearly(7, 9), stateIbgeCode: '33' })
  await insertStateHoliday(fixture, { ...yearly(7, 9) })
  await insertStateHoliday(fixture, { holidayOn: '2026-07-10', stateIbgeCode: '35' })

  await rejected({ holidayOn: '2026-07-09' }, 'company_state_once_unique', UNIQUE_VIOLATION)
  await rejected(yearly(7, 9), 'company_state_yearly_unique', UNIQUE_VIOLATION)
}

export async function assertSettingsConstraints(fixture: CalendarFixture): Promise<void> {
  const { companyId, database } = fixture
  const userId = crypto.randomUUID()

  await database`
    insert into company_business_calendar_settings (company_id, updated_by_user_id)
    values (${companyId}, ${userId})
  `
  const [row] = await database<Array<{ readonly saturday_is_business_day: boolean }>>`
    select saturday_is_business_day from company_business_calendar_settings where company_id = ${companyId}
  `
  expect(row?.saturday_is_business_day).toBeFalse()

  await expectQueryToFail(
    database`insert into company_business_calendar_settings (company_id, updated_by_user_id) values (${companyId}, ${userId})`,
    UNIQUE_VIOLATION,
    'company_business_calendar_settings_pkey',
  )
  await expectQueryToFail(
    database`insert into company_business_calendar_settings (company_id, updated_by_user_id) values (${crypto.randomUUID()}, ${userId})`,
    FOREIGN_KEY_VIOLATION,
    'company_business_calendar_settings_company_id_companies_id_fk',
  )
}
