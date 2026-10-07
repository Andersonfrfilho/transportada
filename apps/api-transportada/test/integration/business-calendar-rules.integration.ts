/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: a regra "todo ano" contra Postgres de verdade. Ela gera as datas fixas de dez anos,
 * é idempotente, deixa a data digitada em paz e apaga em cascata só o que gerou.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq, isNotNull } from 'drizzle-orm'

import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import {
  MunicipalHolidayRuleConflictError,
  MunicipalHolidayRuleInvalidDayError,
} from '../../src/business-calendar/domain/business-calendar-rule.error.js'
import { municipalHolidayRules, municipalHolidays } from '../../src/database/database.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  findHolidayRow,
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
        repository.remove({ ...actorOf(tenant, 'c2'), id: missing }),
      ).resolves.toBeUndefined()
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })

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

        await repository.remove({ ...actorOf(tenant, 'c3'), id: rule.id })

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

        const all = await repository.list({ companyId: tenant.companyId })
        const campinas = await repository.list({
          cityIbgeCode: CAMPINAS,
          companyId: tenant.companyId,
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
