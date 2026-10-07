/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a regra "todo ano" contra Postgres de verdade. Ela gera as datas fixas de dez anos,
 * é idempotente, deixa a data digitada em paz e apaga em cascata só o que gerou.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq, isNotNull } from 'drizzle-orm'

import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { municipalHolidays } from '../../src/database/database.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  readAudits,
  readHolidayRows,
  SAO_PAULO,
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

describe('editar e apagar a regra (spec 238 T1.3)', () => {
  testWithPostgres(
    'editar regenera as datas e não deixa linha órfã nem apaga a digitada',
    async () => {
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
          ...actorOf(tenant, 'corr-create'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })

        const edited = await repository.update({
          ...actorOf(tenant, 'corr-edit'),
          changes: { day: 15, kind: 'holiday', name: 'Dia da cidade' },
          currentYear: 2026,
          id: rule.id,
        })

        expect(edited).toMatchObject({
          day: 15,
          id: rule.id,
          kind: 'holiday',
          materializedThroughYear: 2036,
        })
        const generated = await database.db
          .select()
          .from(municipalHolidays)
          .where(
            and(
              eq(municipalHolidays.companyId, tenant.companyId),
              isNotNull(municipalHolidays.sourceRuleId),
            ),
          )
        expect(generated.map((row) => row.holidayOn).sort()).toEqual(
          Array.from({ length: 11 }, (_unused, index) => `${2026 + index}-07-15`),
        )
        expect(
          generated.every((row) => row.name === 'Dia da cidade' && row.kind === 'holiday'),
        ).toBe(true)
        const rows = await readHolidayRows(database, tenant.companyId)
        expect(rows.filter((row) => row.holidayOn.endsWith('-07-14'))).toHaveLength(1)
        expect(rows.find((row) => row.holidayOn === '2027-07-14')).toMatchObject({
          name: 'Digitado pelo operador',
          sourceRuleId: null,
        })
        const audits = await readAudits(database, tenant.companyId)
        expect(audits[1]).toMatchObject({ action: 'municipal-holiday-rule.updated' })
        expect(audits[1]?.beforeSnapshot).toMatchObject({
          day: 14,
          name: 'Aniversário de Campinas',
        })
        expect(audits[1]?.afterSnapshot).toMatchObject({ day: 15, name: 'Dia da cidade' })
      })
    },
  )

  testWithPostgres(
    'apagar a regra leva só as datas que ela gerou e audita a contagem',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
        const kept = await repository.create({
          ...actorOf(tenant, 'c1'),
          ...ANNIVERSARY,
          cityIbgeCode: SAO_PAULO,
          currentYear: 2026,
        })
        const { rule } = await repository.create({
          ...actorOf(tenant, 'c2'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })

        await repository.remove({ ...actorOf(tenant, 'c3'), currentYear: 2026, id: rule.id })

        const rows = await readHolidayRows(database, tenant.companyId)
        expect(rows).toHaveLength(11)
        expect(rows.every((row) => row.sourceRuleId === kept.rule.id)).toBe(true)
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.at(-1)).toMatchObject({
          action: 'municipal-holiday-rule.deleted',
          entityId: rule.id,
        })
        expect(audits.at(-1)?.metadata).toMatchObject({ generatedHolidaysRemoved: 11 })
      })
    },
  )

  testWithPostgres(
    'a leitura devolve as regras com o ano até onde foram geradas, por cidade',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleMunicipalHolidayRuleRepository(database.db)
        await repository.create({ ...actorOf(tenant, 'c1'), ...ANNIVERSARY, currentYear: 2026 })
        await repository.create({
          ...actorOf(tenant, 'c2'),
          ...ANNIVERSARY,
          cityIbgeCode: SAO_PAULO,
          currentYear: 2027,
          day: 25,
          month: 1,
        })

        const all = await repository.list({ companyId: tenant.companyId, currentYear: 2026 })
        const campinas = await repository.list({
          cityIbgeCode: CAMPINAS,
          companyId: tenant.companyId,
          currentYear: 2026,
        })

        expect(all.map((rule) => [rule.cityIbgeCode, rule.materializedThroughYear])).toEqual([
          [CAMPINAS, 2036],
          [SAO_PAULO, 2037],
        ])
        expect(campinas).toHaveLength(1)
      })
    },
  )
})
