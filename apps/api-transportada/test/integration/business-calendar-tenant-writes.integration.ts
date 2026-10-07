/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a empresa B não lê, não edita e não apaga a regra, o feriado, o feriado estadual nem
 * a configuração da empresa A. O repositório recebe a empresa do contexto, e um id de outra empresa é
 * ausência, nunca 409 (que confirmaria que ele existe).
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { DrizzleBusinessCalendarSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar-settings.repository.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import { municipalHolidayRules, municipalHolidays } from '../../src/database/database.schema.js'
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
  const state = await states.create({
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

describe('a empresa B diante dos dados da A: exclusão e geração (spec 238 T1.3)', () => {
  testWithPostgres(
    'não apaga nenhum deles, nem a gerada: sem 409 que confirme que existe',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const fixture = await seedTwoTenants(database)
        const { generated, holidays, rule, rules, state, states, tenantA, tenantB, typed } = fixture

        await rules.remove({ ...actorOf(tenantB, 'b1'), currentYear: 2026, id: rule.id })
        await holidays.remove({ ...actorOf(tenantB, 'b2'), currentYear: 2026, id: typed.id })
        await holidays.remove({
          ...actorOf(tenantB, 'b3'),
          currentYear: 2026,
          id: generated?.id ?? '',
        })
        await states.remove({ ...actorOf(tenantB, 'b4'), id: state.id })

        expect(await rules.list({ companyId: tenantA.companyId, currentYear: 2026 })).toHaveLength(
          1,
        )
        expect(await readHolidayRows(database, tenantA.companyId)).toHaveLength(12)
        expect(await states.list({ companyId: tenantA.companyId })).toHaveLength(1)
        expect(await readAudits(database, tenantB.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'gerar os próximos anos e gravar a configuração só mexem na própria empresa',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const { rules, settings, tenantA, tenantB } = await seedTwoTenants(database)

        const summary = await rules.materialize({ ...actorOf(tenantB, 'b1'), currentYear: 2030 })
        await settings.save({ ...actorOf(tenantB, 'b2'), saturdayIsBusinessDay: false })

        expect(summary).toEqual({ holidaysCreated: 0, rulesProcessed: 0 })
        const [rule] = await database.db.select().from(municipalHolidayRules)
        expect(rule?.materializedThroughYear).toBe(2036)
        expect(await settings.find({ companyId: tenantA.companyId })).toMatchObject({
          saturdayIsBusinessDay: true,
        })
        expect(await settings.find({ companyId: tenantB.companyId })).toMatchObject({
          saturdayIsBusinessDay: false,
        })
      })
    },
  )

  testWithPostgres(
    'a mesma cidade e o mesmo dia em outra empresa é outra regra, sem conflito',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const { rules, tenantB } = await seedTwoTenants(database)

        const created = await rules.create({
          ...actorOf(tenantB, 'b1'),
          cityIbgeCode: CAMPINAS,
          currentYear: 2026,
          day: 14,
          kind: 'holiday',
          month: 7,
          name: 'Outro nome, outra empresa',
        })

        expect(created.created).toBe(true)
        const owned = await database.db
          .select()
          .from(municipalHolidays)
          .where(eq(municipalHolidays.companyId, tenantB.companyId))
        expect(owned).toHaveLength(11)
        expect(owned.every((row) => row.sourceRuleId === created.rule.id)).toBe(true)
      })
    },
  )
})
