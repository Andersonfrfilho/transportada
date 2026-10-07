/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o que a política de dias úteis lê. `municipal_holidays` entra só com as datas
 * digitadas (as geradas são a mesma causa que a regra, e a política já a expande); a cobertura, a
 * cidade e a empresa recortam; e cada consulta tem teto para a política recusar o excesso.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import {
  addBusinessDays,
  buildBusinessCalendar,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import { BUSINESS_CALENDAR_ERROR_CODE } from '../../src/business-calendar/domain/business-calendar.constant.js'
import { DrizzleBusinessCalendarRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar.repository.js'
import { DrizzleBusinessCalendarSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar-settings.repository.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  SAO_PAULO,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
  type Tenant,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const COVERAGE = { fromYear: 2026, toYear: 2027 } as const

async function seedCalendar(database: TestDatabase, tenant: Tenant) {
  const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
  const holidays = new DrizzleMunicipalHolidayRepository(database.db)
  const states = new DrizzleStateHolidayRepository(database.db)
  const actor = (correlationId: string) => actorOf(tenant, correlationId)

  await rules.create({
    ...actor('r1'),
    cityIbgeCode: CAMPINAS,
    currentYear: 2026,
    day: 14,
    kind: 'city_anniversary',
    month: 7,
    name: 'Aniversário de Campinas',
  })
  await rules.create({
    ...actor('r2'),
    cityIbgeCode: SAO_PAULO,
    currentYear: 2026,
    day: 25,
    kind: 'city_anniversary',
    month: 1,
    name: 'Aniversário de São Paulo',
  })
  await holidays.save({
    ...actor('h1'),
    cityIbgeCode: CAMPINAS,
    holidayOn: '2026-10-13',
    name: 'Digitado',
  })
  await holidays.save({
    ...actor('h2'),
    cityIbgeCode: CAMPINAS,
    holidayOn: '2031-10-13',
    name: 'Fora',
  })
  await states.create({
    ...actor('s1'),
    name: 'Revolução',
    month: 7,
    day: 9,
    recurrence: 'yearly',
    stateIbgeCode: '35',
  })
  await states.create({
    ...actor('s2'),
    holidayOn: '2026-08-01',
    name: 'Dentro',
    recurrence: 'once',
    stateIbgeCode: '35',
  })
  await states.create({
    ...actor('s3'),
    holidayOn: '2031-08-01',
    name: 'Fora',
    recurrence: 'once',
    stateIbgeCode: '35',
  })
  await states.create({
    ...actor('s4'),
    holidayOn: '2026-08-02',
    name: 'Outro estado',
    recurrence: 'once',
    stateIbgeCode: '33',
  })
  await new DrizzleBusinessCalendarSettingsRepository(database.db).save({
    ...actor('c1'),
    saturdayIsBusinessDay: true,
  })
}

describe('a leitura das regras para a política (spec 238 T1.3)', () => {
  testWithPostgres('traz as regras e as datas digitadas; as geradas ficam de fora', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      await seedCalendar(database, tenant)
      const repository = new DrizzleBusinessCalendarRepository(database.db)

      const loaded = await repository.loadRules({
        cityCodes: [CAMPINAS],
        companyId: tenant.companyId,
        coverage: COVERAGE,
      })

      expect(loaded.municipalRules).toEqual([
        {
          cityIbgeCode: CAMPINAS,
          kind: 'city_anniversary',
          name: 'Aniversário de Campinas',
          occurrence: { day: 14, month: 7, recurrence: 'yearly' },
        },
        {
          cityIbgeCode: CAMPINAS,
          kind: 'holiday',
          name: 'Digitado',
          occurrence: { date: '2026-10-13', recurrence: 'once' },
        },
      ])
      expect(loaded.saturdayIsBusinessDay).toBe(true)
    })
  })

  testWithPostgres(
    'o feriado estadual vem da UF das cidades: o todo ano e o da cobertura',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        await seedCalendar(database, tenant)
        const repository = new DrizzleBusinessCalendarRepository(database.db)

        const loaded = await repository.loadRules({
          cityCodes: [CAMPINAS, SAO_PAULO],
          companyId: tenant.companyId,
          coverage: COVERAGE,
        })

        expect(loaded.stateRules.map((rule) => [rule.stateIbgeCode, rule.name]).sort()).toEqual([
          ['35', 'Dentro'],
          ['35', 'Revolução'],
        ])
        expect(
          loaded.municipalRules.filter((rule) => rule.cityIbgeCode === SAO_PAULO),
        ).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'lista de cidades vazia não traz regra, e o sábado segue a empresa',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        await seedCalendar(database, tenant)

        const loaded = await new DrizzleBusinessCalendarRepository(database.db).loadRules({
          cityCodes: [],
          companyId: tenant.companyId,
          coverage: COVERAGE,
        })

        expect(loaded).toEqual({ municipalRules: [], saturdayIsBusinessDay: true, stateRules: [] })
      })
    },
  )

  testWithPostgres('sem configuração o sábado não é dia útil', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)

      const loaded = await new DrizzleBusinessCalendarRepository(database.db).loadRules({
        cityCodes: [CAMPINAS],
        companyId: tenant.companyId,
        coverage: COVERAGE,
      })

      expect(loaded.saturdayIsBusinessDay).toBe(false)
    })
  })

  testWithPostgres('de ponta a ponta: o calendário de Campinas dá o CA1 da spec', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      await seedCalendar(database, tenant)
      const loaded = await new DrizzleBusinessCalendarRepository(database.db).loadRules({
        cityCodes: [CAMPINAS],
        companyId: tenant.companyId,
        coverage: COVERAGE,
      })
      const calendar = buildBusinessCalendar({
        cityIbgeCode: CAMPINAS,
        coverage: COVERAGE,
        municipalRules: loaded.municipalRules,
        saturdayIsBusinessDay: false,
        stateRules: loaded.stateRules,
      })

      const result = addBusinessDays({ calendar, days: 3, start: '2026-10-09' })

      expect(result.date).toBe('2026-10-16')
    })
  })

  testWithPostgres(
    'mais regras que o teto: a leitura traz o excedente e a política recusa',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        // 14 UFs x 366 dias de 2000 (ano bissexto) = 5124 regras anuais, numa instrução só
        await database.db.execute(sql`
        insert into state_holidays (company_id, state_ibge_code, recurrence, month, day, name)
        select ${tenant.companyId}, states.code, 'yearly', extract(month from days.day)::int,
               extract(day from days.day)::int, 'Feriado'
        from (values ('11'),('12'),('13'),('14'),('15'),('16'),('17'),('21'),('22'),('23'),('24'),
                     ('25'),('26'),('27')) as states(code),
             generate_series(date '2000-01-01', date '2000-12-31', interval '1 day') as days(day)
      `)
        const cityCodes = [
          '1100015',
          '1200013',
          '1300029',
          '1400050',
          '1500107',
          '1600105',
          '1700251',
          '2100055',
          '2200053',
          '2300101',
          '2400109',
          '2500106',
          '2600054',
          '2700102',
        ]

        const loaded = await new DrizzleBusinessCalendarRepository(database.db).loadRules({
          cityCodes,
          companyId: tenant.companyId,
          coverage: COVERAGE,
        })

        expect(loaded.stateRules).toHaveLength(5001)
        const refusal = (() => {
          try {
            buildBusinessCalendar({
              cityIbgeCode: '1100015',
              coverage: COVERAGE,
              municipalRules: loaded.municipalRules,
              saturdayIsBusinessDay: false,
              stateRules: loaded.stateRules,
            })
          } catch (error) {
            return error
          }
          return undefined
        })()
        expect(refusal).toMatchObject({ code: BUSINESS_CALENDAR_ERROR_CODE.TOO_MANY_RULES })
      })
    },
  )
})
