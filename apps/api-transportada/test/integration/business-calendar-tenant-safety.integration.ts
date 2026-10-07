/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a empresa B não lê, não edita e não apaga a regra, o feriado, o feriado estadual nem
 * a configuração da empresa A. O repositório recebe a empresa do contexto, e um id de outra empresa é
 * ausência, nunca 409 (que confirmaria que ele existe).
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleBusinessCalendarRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar.repository.js'
import { DrizzleBusinessCalendarSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar-settings.repository.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import { municipalHolidayRules } from '../../src/database/database.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  findHolidayRow,
  readAudits,
  readHolidayRows,
  seedTenant,
  withBusinessCalendarDatabase,
  type TestDatabase,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const COVERAGE = { fromYear: 2026, toYear: 2027 } as const

async function seedTwoTenants(database: TestDatabase) {
  const tenantA = await seedTenant(database)
  const tenantB = await seedTenant(database)
  const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
  const holidays = new DrizzleMunicipalHolidayRepository(database.db)
  const states = new DrizzleStateHolidayRepository(database.db)
  const settings = new DrizzleBusinessCalendarSettingsRepository(database.db)
  const { rule } = await rules.create({
    ...actorOf(tenantA, 'a-rule'),
    cityIbgeCode: CAMPINAS,
    currentYear: 2026,
    day: 14,
    kind: 'city_anniversary',
    month: 7,
    name: 'Aniversário de Campinas',
  })
  const { holiday: typed } = await holidays.save({
    ...actorOf(tenantA, 'a-typed'),
    cityIbgeCode: CAMPINAS,
    holidayOn: '2026-12-08',
    name: 'Padroeira',
  })
  const { holiday: state } = await states.create({
    ...actorOf(tenantA, 'a-state'),
    holidayOn: '2026-08-01',
    name: 'Estadual',
    recurrence: 'once',
    stateIbgeCode: '35',
  })
  await settings.save({ ...actorOf(tenantA, 'a-settings'), saturdayIsBusinessDay: true })
  const generated = await findHolidayRow(database, {
    companyId: tenantA.companyId,
    holidayOn: '2028-07-14',
  })

  return { generated, holidays, rule, rules, settings, state, states, tenantA, tenantB, typed }
}

describe('a empresa B diante dos dados da A: leitura e edição (spec 238 T1.3)', () => {
  testWithPostgres('não lê regra, feriado, feriado estadual nem configuração', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const { holidays, rules, settings, states, tenantB } = await seedTwoTenants(database)

      expect(await rules.list({ companyId: tenantB.companyId, currentYear: 2026 })).toEqual([])
      expect(await holidays.list({ companyId: tenantB.companyId })).toEqual([])
      expect(await states.list({ companyId: tenantB.companyId })).toEqual([])
      expect(await settings.find({ companyId: tenantB.companyId })).toBeNull()
      const loaded = await new DrizzleBusinessCalendarRepository(database.db).loadRules({
        cityCodes: [CAMPINAS],
        companyId: tenantB.companyId,
        coverage: COVERAGE,
      })
      expect(loaded).toEqual({ municipalRules: [], saturdayIsBusinessDay: false, stateRules: [] })
    })
  })

  testWithPostgres('não edita nenhum deles: recebe ausência e nada muda', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const fixture = await seedTwoTenants(database)
      const { generated, holidays, rule, rules, state, states, tenantA, tenantB, typed } = fixture

      expect(
        await rules.update({
          ...actorOf(tenantB, 'b1'),
          changes: { name: 'Invadida' },
          currentYear: 2026,
          id: rule.id,
        }),
      ).toBeNull()
      expect(
        await holidays.update({
          ...actorOf(tenantB, 'b2'),
          changes: { name: 'Invadido' },
          id: typed.id,
        }),
      ).toBeNull()
      expect(
        await holidays.update({
          ...actorOf(tenantB, 'b3'),
          changes: { name: 'Invadido' },
          id: generated?.id ?? '',
        }),
      ).toBeNull()
      expect(
        await states.update({
          ...actorOf(tenantB, 'b4'),
          changes: { name: 'Invadido', recurrence: 'once' },
          id: state.id,
        }),
      ).toBeNull()

      const [storedRule] = await database.db.select().from(municipalHolidayRules)
      expect(storedRule?.name).toBe('Aniversário de Campinas')
      expect(
        (await readHolidayRows(database, tenantA.companyId)).map((row) => row.name),
      ).not.toContain('Invadido')
      expect(await states.list({ companyId: tenantA.companyId })).toHaveLength(1)
      expect(await readAudits(database, tenantB.companyId)).toEqual([])
    })
  })
})
