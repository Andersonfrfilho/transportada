/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a regra "todo ano" contra Postgres de verdade. Ela gera as datas fixas de dez anos,
 * é idempotente, deixa a data digitada em paz e apaga em cascata só o que gerou.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { municipalHolidayRules } from '../../src/database/database.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  readAudits,
  readHolidayRows,
  seedTenant,
  withBusinessCalendarDatabase,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const ANNIVERSARY = {
  cityIbgeCode: CAMPINAS,
  day: 14,
  kind: 'city_anniversary',
  month: 7,
  name: 'Aniversário de Campinas',
} as const

describe('a regra "todo ano" gera as datas fixas (spec 238 T1.3)', () => {
  testWithPostgres('14/07 gera onze linhas, de 2026 a 2036, ligadas à regra', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)

      const { created, rule } = await repository.create({
        ...actorOf(tenant, 'corr-create'),
        ...ANNIVERSARY,
        currentYear: 2026,
      })

      expect(created).toBe(true)
      expect(rule.materializedThroughYear).toBe(2036)
      const rows = await readHolidayRows(database, tenant.companyId)
      expect(rows.map((row) => row.holidayOn)).toEqual(
        Array.from({ length: 11 }, (_unused, index) => `${2026 + index}-07-14`),
      )
      for (const row of rows) {
        expect(row).toMatchObject({
          cityIbgeCode: CAMPINAS,
          kind: 'city_anniversary',
          name: 'Aniversário de Campinas',
          sourceRuleId: rule.id,
        })
      }
      const [audit] = await readAudits(database, tenant.companyId)
      expect(audit).toMatchObject({
        action: 'municipal-holiday-rule.created',
        actorUserId: tenant.userId,
        companyId: tenant.companyId,
        correlationId: 'corr-create',
        entityId: rule.id,
        permission: 'settings.manage',
        targetType: 'municipal_holiday_rule',
      })
      expect(audit?.metadata).toMatchObject({ holidaysCreated: 11, ipAddress: '203.0.113.7' })
    })
  })

  testWithPostgres('29/02 só gera os anos bissextos do horizonte', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)

      const { rule } = await repository.create({
        ...actorOf(tenant, 'corr-leap'),
        ...ANNIVERSARY,
        currentYear: 2026,
        day: 29,
        month: 2,
      })

      const rows = await readHolidayRows(database, tenant.companyId)
      expect(rows.map((row) => row.holidayOn)).toEqual(['2028-02-29', '2032-02-29', '2036-02-29'])
      expect(rule.materializedThroughYear).toBe(2036)
    })
  })

  testWithPostgres(
    'gerar de novo não muda nada, nem os ids; o ano novo só acrescenta',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
        await repository.create({ ...actorOf(tenant, 'corr-1'), ...ANNIVERSARY, currentYear: 2026 })
        const before = await readHolidayRows(database, tenant.companyId)

        const again = await repository.materialize({
          ...actorOf(tenant, 'corr-2'),
          currentYear: 2026,
        })
        const after = await readHolidayRows(database, tenant.companyId)

        expect(again).toEqual({ holidaysCreated: 0, rulesProcessed: 1 })
        expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id))

        const later = await repository.materialize({
          ...actorOf(tenant, 'corr-3'),
          currentYear: 2028,
        })
        const extended = await readHolidayRows(database, tenant.companyId)

        expect(later).toEqual({ holidaysCreated: 2, rulesProcessed: 1 })
        expect(extended.map((row) => row.holidayOn).slice(-3)).toEqual([
          '2036-07-14',
          '2037-07-14',
          '2038-07-14',
        ])
        expect(extended.filter((row) => before.some((old) => old.id === row.id))).toHaveLength(11)
        const [stored] = await database.db.select().from(municipalHolidayRules)
        expect(stored?.materializedThroughYear).toBe(2038)
      })
    },
  )
})
