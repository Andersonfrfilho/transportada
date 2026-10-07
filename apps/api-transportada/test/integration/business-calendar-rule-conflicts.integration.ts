/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a regra "todo ano" contra Postgres de verdade. Ela gera as datas fixas de dez anos,
 * é idempotente, deixa a data digitada em paz e apaga em cascata só o que gerou.
 */
import { describe, expect, test } from 'bun:test'
import { isNotNull } from 'drizzle-orm'

import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { MunicipalHolidayRuleConflictError } from '../../src/business-calendar/domain/business-calendar-rule.error.js'
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
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const ANNIVERSARY = {
  cityIbgeCode: CAMPINAS,
  day: 14,
  kind: 'city_anniversary',
  month: 7,
  name: 'Aniversário de Campinas',
} as const

describe('a regra diante da data digitada e do conflito (spec 238 T1.3)', () => {
  testWithPostgres('a data que o operador já digitou vence a da regra e fica', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
      await database.db.insert(municipalHolidays).values({
        cityIbgeCode: CAMPINAS,
        companyId: tenant.companyId,
        holidayOn: '2027-07-14',
        name: 'Digitado pelo operador',
      })

      const { rule } = await repository.create({
        ...actorOf(tenant, 'corr-typed'),
        ...ANNIVERSARY,
        currentYear: 2026,
      })

      const typed = await findHolidayRow(database, {
        companyId: tenant.companyId,
        holidayOn: '2027-07-14',
      })
      expect(typed).toMatchObject({
        kind: 'holiday',
        name: 'Digitado pelo operador',
        sourceRuleId: null,
      })
      const generated = await database.db
        .select()
        .from(municipalHolidays)
        .where(isNotNull(municipalHolidays.sourceRuleId))
      expect(generated).toHaveLength(10)

      await repository.remove({ ...actorOf(tenant, 'corr-remove'), id: rule.id })

      const remaining = await readHolidayRows(database, tenant.companyId)
      expect(remaining.map((row) => row.name)).toEqual(['Digitado pelo operador'])
    })
  })

  testWithPostgres(
    'a mesma regra de novo devolve a existente; a divergente é conflito',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
        const first = await repository.create({
          ...actorOf(tenant, 'corr-first'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })

        const same = await repository.create({
          ...actorOf(tenant, 'corr-same'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })
        expect(same).toEqual({ created: false, rule: first.rule })
        await expect(
          repository.create({
            ...actorOf(tenant, 'corr-other-name'),
            ...ANNIVERSARY,
            currentYear: 2026,
            name: 'Outro nome',
          }),
        ).rejects.toBeInstanceOf(MunicipalHolidayRuleConflictError)
        await expect(
          repository.create({
            ...actorOf(tenant, 'corr-other-kind'),
            ...ANNIVERSARY,
            currentYear: 2026,
            kind: 'holiday',
          }),
        ).rejects.toBeInstanceOf(MunicipalHolidayRuleConflictError)

        expect(await readHolidayRows(database, tenant.companyId)).toHaveLength(11)
        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'a falha depois da auditoria desfaz a regra, as datas e a linha de auditoria',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const failing = {
          transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
            database.db.transaction(async (transaction) => {
              await callback(transaction)
              throw new Error('simulated failure after the audit insert')
            }),
        }

        await expect(
          new DrizzleMunicipalHolidayRuleRepository(failing as never).create({
            ...actorOf(tenant, 'corr-late'),
            ...ANNIVERSARY,
            currentYear: 2026,
          }),
        ).rejects.toThrow('simulated failure')

        expect(await database.db.select().from(municipalHolidayRules)).toHaveLength(0)
        expect(await readHolidayRows(database, tenant.companyId)).toHaveLength(0)
        expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
      })
    },
  )
})
