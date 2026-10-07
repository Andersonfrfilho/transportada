/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a regra "todo ano" contra Postgres de verdade. Ela gera as datas fixas de dez anos,
 * é idempotente, deixa a data digitada em paz e apaga em cascata só o que gerou.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import {
  MunicipalHolidayRuleConflictError,
  MunicipalHolidayRuleInvalidDayError,
} from '../../src/business-calendar/domain/business-calendar-rule.error.js'
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

describe('editar a regra para um dia que não cabe (spec 238 T1.3)', () => {
  testWithPostgres(
    'editar para o dia de outra regra da cidade é conflito; dia que não existe é 400',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
        const first = await repository.create({
          ...actorOf(tenant, 'c1'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })
        await repository.create({
          ...actorOf(tenant, 'c2'),
          ...ANNIVERSARY,
          currentYear: 2026,
          day: 15,
        })
        const january = await repository.create({
          ...actorOf(tenant, 'c3'),
          ...ANNIVERSARY,
          currentYear: 2026,
          day: 31,
          month: 1,
        })

        await expect(
          repository.update({
            ...actorOf(tenant, 'c4'),
            changes: { day: 15 },
            currentYear: 2026,
            id: first.rule.id,
          }),
        ).rejects.toBeInstanceOf(MunicipalHolidayRuleConflictError)
        await expect(
          repository.update({
            ...actorOf(tenant, 'c5'),
            changes: { month: 4 },
            currentYear: 2026,
            id: january.rule.id,
          }),
        ).rejects.toBeInstanceOf(MunicipalHolidayRuleInvalidDayError)
        expect(
          (await readHolidayRows(database, tenant.companyId)).filter((row) =>
            row.holidayOn.endsWith('-07-14'),
          ),
        ).toHaveLength(11)
      })
    },
  )

  testWithPostgres('editar ou apagar o que não existe: null e no-op, sem auditoria', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
      const missing = crypto.randomUUID()

      expect(
        await repository.update({
          ...actorOf(tenant, 'c1'),
          changes: { name: 'x' },
          currentYear: 2026,
          id: missing,
        }),
      ).toBeNull()
      await expect(
        repository.remove({ ...actorOf(tenant, 'c2'), currentYear: 2026, id: missing }),
      ).resolves.toBeUndefined()
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})
