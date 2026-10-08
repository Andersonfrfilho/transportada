/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o que a política de dias úteis lê. `municipal_holidays` entra só com as datas
 * digitadas (as geradas são a mesma causa que a regra, e a política já a expande); a cobertura, a
 * cidade e a empresa recortam; e cada consulta tem teto para a política recusar o excesso.
 */
import { describe, expect, test } from 'bun:test'

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
})
