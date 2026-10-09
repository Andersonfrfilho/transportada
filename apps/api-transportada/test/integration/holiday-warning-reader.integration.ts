/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6, CA12, CA13): o aviso lido das tabelas reais. A origem sai de `provider_entry_id`
 * (importada), de `source_rule_id`/regra (regra) e do resto (digitada); o dia que fecha por feriado de
 * outra empresa não avisa; o custo é fixo.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleHolidayWarningRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-warning.repository.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
  type Tenant,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  seedImportedMunicipalHoliday,
  seedImportedStateHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const SANTOS = '3548500'
const SAO_PAULO_STATE = '35'

function item(city: string, date: string) {
  return { cityIbgeCode: city, date, key: `${city}:${date}` }
}

async function seedCalendar(database: TestDatabase, tenant: Tenant): Promise<void> {
  const holidays = new DrizzleMunicipalHolidayRepository(database.db)
  const states = new DrizzleStateHolidayRepository(database.db)
  const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
  await seedImportedMunicipalHoliday(database, tenant, {
    holidayOn: '2026-11-10',
    ibgeCode: CAMPINAS,
    name: 'Importado de Campinas',
  })
  await holidays.save({
    ...actorOf(tenant, 'typed'),
    cityIbgeCode: SANTOS,
    holidayOn: '2026-12-08',
    name: 'Digitado de Santos',
  })
  await rules.create({
    ...actorOf(tenant, 'rule'),
    cityIbgeCode: CAMPINAS,
    currentYear: 2026,
    day: 14,
    kind: 'city_anniversary',
    month: 7,
    name: 'Aniversário de Campinas',
  })
  await states.create({
    ...actorOf(tenant, 'state'),
    holidayOn: '2026-08-05',
    name: 'Estadual digitado',
    recurrence: 'once',
    stateIbgeCode: SAO_PAULO_STATE,
  })
  await seedImportedStateHoliday(database, tenant, {
    holidayOn: '2026-09-09',
    ibgeCode: SAO_PAULO_STATE,
    name: 'Estadual importado',
  })
}

describe('o aviso lido das tabelas reais (spec 252 T4.2)', () => {
  testWithPostgres(
    'cada dia traz a origem certa: importada, digitada, regra, estadual e nacional',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        await seedCalendar(database, tenant)
        const repository = new DrizzleHolidayWarningRepository(database.db)

        const { refusals, warnings } = await repository.read({
          companyId: tenant.companyId,
          items: [
            item(CAMPINAS, '2026-11-10'),
            item(SANTOS, '2026-12-08'),
            item(CAMPINAS, '2026-07-14'),
            item(CAMPINAS, '2026-08-05'),
            item(CAMPINAS, '2026-09-09'),
            item(CAMPINAS, '2026-09-07'),
            item(CAMPINAS, '2026-11-11'),
          ],
        })

        expect(refusals.size).toBe(0)
        const reasonsOf = (city: string, date: string) => warnings.get(`${city}:${date}`)?.reasons
        expect(reasonsOf(CAMPINAS, '2026-11-10')).toEqual([
          { name: 'Importado de Campinas', origin: 'imported', scope: 'municipal' },
        ])
        expect(reasonsOf(SANTOS, '2026-12-08')).toEqual([
          { name: 'Digitado de Santos', origin: 'typed', scope: 'municipal' },
        ])
        expect(reasonsOf(CAMPINAS, '2026-07-14')).toEqual([
          { name: 'Aniversário de Campinas', origin: 'rule', scope: 'municipal' },
        ])
        expect(reasonsOf(CAMPINAS, '2026-08-05')).toEqual([
          { name: 'Estadual digitado', origin: 'typed', scope: 'state' },
        ])
        expect(reasonsOf(CAMPINAS, '2026-09-09')).toEqual([
          { name: 'Estadual importado', origin: 'imported', scope: 'state' },
        ])
        expect(reasonsOf(CAMPINAS, '2026-09-07')).toEqual([
          { name: 'independence_day', origin: 'code', scope: 'national' },
        ])
        expect(warnings.has(`${CAMPINAS}:2026-11-11`)).toBe(false)
        expect(warnings.get(`${CAMPINAS}:2026-11-10`)?.cityIbgeCode).toBe(3509502)
      })
    },
  )

  testWithPostgres(
    'o feriado da outra empresa não avisa, nem o importado dela (BOLA)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenantA = await seedTenant(database)
        const tenantB = await seedTenant(database)
        await seedCalendar(database, tenantB)
        await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: '2026-11-12',
          ibgeCode: CAMPINAS,
        })
        const repository = new DrizzleHolidayWarningRepository(database.db)

        const { warnings } = await repository.read({
          companyId: tenantA.companyId,
          items: [
            item(CAMPINAS, '2026-11-10'),
            item(SANTOS, '2026-12-08'),
            item(CAMPINAS, '2026-07-14'),
            item(CAMPINAS, '2026-08-05'),
            item(CAMPINAS, '2026-11-12'),
          ],
        })

        expect([...warnings.keys()]).toEqual([`${CAMPINAS}:2026-11-12`])
      })
    },
  )

  testWithPostgres(
    'o desligado não avisa mais: a linha saiu e a supressão a mantém fora',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: '2026-11-10',
          ibgeCode: CAMPINAS,
        })
        const repository = new DrizzleHolidayWarningRepository(database.db)
        const read = () =>
          repository.read({ companyId: tenant.companyId, items: [item(CAMPINAS, '2026-11-10')] })

        const before = await read()
        await holidays.remove({
          ...actorOf(tenant, 'disable'),
          currentYear: 2026,
          id: imported.id,
          today: '2026-10-09',
        })
        const after = await read()

        expect(before.warnings.size).toBe(1)
        expect(after.warnings.size).toBe(0)
      })
    },
  )
})
