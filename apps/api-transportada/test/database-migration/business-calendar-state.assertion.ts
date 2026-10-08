/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: o que o banco recusa e o que ele aceita no feriado estadual e na configuração de
 * sábado da empresa.
 */
import { expect } from 'bun:test'

import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
  type CalendarFixture,
  type ViolationCode,
} from './business-calendar-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

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
  const rejected = (
    values: StateHolidayValues,
    constraint: string,
    code: ViolationCode = CHECK_VIOLATION,
  ) => expectQueryToFail(insertStateHoliday(fixture, values), code, `state_holidays_${constraint}`)
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
