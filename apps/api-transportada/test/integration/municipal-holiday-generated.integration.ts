/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: como a data digitada à mão e a gerada pela regra convivem em `municipal_holidays`,
 * que é a tabela que o roteirizador lê. Quem manda: a digitada; a gerada só se mexe pela regra.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { MunicipalHolidayGeneratedByRuleError } from '../../src/business-calendar/domain/business-calendar-rule.error.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { municipalHolidays } from '../../src/database/database.schema.js'
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
  type Tenant,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const ANNIVERSARY = {
  cityIbgeCode: CAMPINAS,
  day: 14,
  kind: 'city_anniversary',
  month: 7,
  name: 'Aniversário de Campinas',
} as const

async function seedRule(database: TestDatabase, tenant: Tenant) {
  const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
  const { rule } = await rules.create({
    ...actorOf(tenant, 'seed-rule'),
    ...ANNIVERSARY,
    currentYear: 2026,
  })
  return { holidays: new DrizzleMunicipalHolidayRepository(database.db), rule, rules }
}

describe('a data gerada só se mexe pela regra (spec 238 T1.3)', () => {
  testWithPostgres('apagar a gerada é 409 e a linha continua lá; a digitada se apaga', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const { holidays } = await seedRule(database, tenant)
      const generated = await findHolidayRow(database, {
        companyId: tenant.companyId,
        holidayOn: '2028-07-14',
      })

      await expect(
        holidays.remove({
          ...actorOf(tenant, 'corr-1'),
          currentYear: 2026,
          id: generated?.id ?? '',
        }),
      ).rejects.toBeInstanceOf(MunicipalHolidayGeneratedByRuleError)

      expect(
        await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: '2028-07-14' }),
      ).toBeDefined()
      expect(await readHolidayRows(database, tenant.companyId)).toHaveLength(11)
    })
  })

  testWithPostgres(
    'editar a gerada é 409; a digitada se edita; a que não existe devolve null',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { holidays } = await seedRule(database, tenant)
        const generated = await findHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: '2028-07-14',
        })
        const { holiday: typed } = await holidays.save({
          ...actorOf(tenant, 'corr-typed'),
          cityIbgeCode: CAMPINAS,
          holidayOn: '2026-12-08',
          name: 'Padroeira',
        })

        await expect(
          holidays.update({
            ...actorOf(tenant, 'corr-1'),
            changes: { name: 'x' },
            id: generated?.id ?? '',
          }),
        ).rejects.toBeInstanceOf(MunicipalHolidayGeneratedByRuleError)
        const edited = await holidays.update({
          ...actorOf(tenant, 'corr-2'),
          changes: { kind: 'city_anniversary', name: 'Nossa Senhora' },
          id: typed.id,
        })
        const missing = await holidays.update({
          ...actorOf(tenant, 'corr-3'),
          changes: { name: 'x' },
          id: crypto.randomUUID(),
        })

        expect(edited).toMatchObject({
          id: typed.id,
          kind: 'city_anniversary',
          name: 'Nossa Senhora',
        })
        expect(missing).toBeNull()
        const [row] = await database.db
          .select()
          .from(municipalHolidays)
          .where(
            and(
              eq(municipalHolidays.id, generated?.id ?? ''),
              eq(municipalHolidays.name, ANNIVERSARY.name),
            ),
          )
        expect(row).toBeDefined()
      })
    },
  )

  testWithPostgres(
    'apagar o que não existe é no-op, sem auditoria; apagar a digitada audita',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)

        await holidays.remove({
          ...actorOf(tenant, 'corr-1'),
          currentYear: 2026,
          id: crypto.randomUUID(),
        })
        expect(await readAudits(database, tenant.companyId)).toHaveLength(0)

        const { holiday: typed } = await holidays.save({
          ...actorOf(tenant, 'corr-2'),
          cityIbgeCode: CAMPINAS,
          holidayOn: '2026-12-08',
          name: 'Padroeira',
        })
        await holidays.remove({ ...actorOf(tenant, 'corr-3'), currentYear: 2026, id: typed.id })

        const audits = await readAudits(database, tenant.companyId)
        expect(audits.map((audit) => audit.action)).toEqual([
          'municipal-holiday.saved',
          'municipal-holiday.deleted',
        ])
        expect(audits[1]).toMatchObject({ entityId: typed.id, correlationId: 'corr-3' })
        expect(audits[1]?.beforeSnapshot).toMatchObject({
          holidayOn: '2026-12-08',
          name: 'Padroeira',
        })
      })
    },
  )

  testWithPostgres('a leitura antiga mostra o tipo e a regra de origem de cada data', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const { holidays, rule } = await seedRule(database, tenant)
      await holidays.save({
        ...actorOf(tenant, 'corr-typed'),
        cityIbgeCode: CAMPINAS,
        holidayOn: '2026-12-08',
        name: 'Padroeira',
      })

      const listed = await holidays.list({
        cityIbgeCode: CAMPINAS,
        companyId: tenant.companyId,
        from: '2026-01-01',
        to: '2026-12-31',
      })

      expect(
        listed.map((holiday) => [holiday.holidayOn, holiday.kind, holiday.generatedByRuleId]),
      ).toEqual([
        ['2026-07-14', 'city_anniversary', rule.id],
        ['2026-12-08', 'holiday', null],
      ])
    })
  })
})
