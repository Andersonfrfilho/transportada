/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: como a data digitada à mão e a gerada pela regra convivem em `municipal_holidays`,
 * que é a tabela que o roteirizador lê. Quem manda: a digitada; a gerada só se mexe pela regra.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
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

describe('digitar sobre a data de uma regra (spec 238 T1.3)', () => {
  testWithPostgres(
    'adotar a data gerada a torna do operador: sobrevive à exclusão da regra',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { holidays, rule, rules } = await seedRule(database, tenant)

        const adopted = await holidays.save({
          ...actorOf(tenant, 'corr-adopt'),
          cityIbgeCode: CAMPINAS,
          holidayOn: '2027-07-14',
          name: 'Ponto facultativo',
        })

        expect(adopted).toMatchObject({
          generatedByRuleId: null,
          kind: 'city_anniversary',
          name: 'Ponto facultativo',
        })
        await rules.remove({ ...actorOf(tenant, 'corr-remove'), id: rule.id })
        expect(await readHolidayRows(database, tenant.companyId)).toEqual([
          expect.objectContaining({
            holidayOn: '2027-07-14',
            name: 'Ponto facultativo',
            sourceRuleId: null,
          }),
        ])
      })
    },
  )

  testWithPostgres('recadastrar sem tipo mantém o tipo; com tipo, troca', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)
      const base = { ...actorOf(tenant, 'corr-1'), cityIbgeCode: CAMPINAS, holidayOn: '2026-12-08' }
      const first = await holidays.save({ ...base, kind: 'city_anniversary', name: 'Padroeira' })

      const renamed = await holidays.save({ ...base, name: 'Nossa Senhora' })
      const retyped = await holidays.save({ ...base, kind: 'holiday', name: 'Nossa Senhora' })

      expect(first.kind).toBe('city_anniversary')
      expect(renamed).toMatchObject({
        id: first.id,
        kind: 'city_anniversary',
        name: 'Nossa Senhora',
      })
      expect(retyped).toMatchObject({ id: first.id, kind: 'holiday' })
      expect(await readHolidayRows(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('o POST antigo, sem tipo, cria o feriado comum', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)

      const saved = await holidays.save({
        ...actorOf(tenant, 'corr-old'),
        cityIbgeCode: CAMPINAS,
        holidayOn: '2026-11-02',
        name: 'Finados',
      })

      expect(saved).toMatchObject({ generatedByRuleId: null, kind: 'holiday' })
      const [audit] = await readAudits(database, tenant.companyId)
      expect(audit).toMatchObject({ action: 'municipal-holiday.saved', entityId: saved.id })
    })
  })

  testWithPostgres(
    'apagar a data digitada sobre o dia da regra gera de novo a da regra',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { holidays, rule } = await seedRule(database, tenant)
        const typed = await holidays.save({
          ...actorOf(tenant, 'corr-typed'),
          cityIbgeCode: CAMPINAS,
          holidayOn: '2027-07-14',
          name: 'Digitado',
        })

        await holidays.remove({
          ...actorOf(tenant, 'corr-delete'),
          currentYear: 2026,
          id: typed.id,
        })

        const regenerated = await findHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: '2027-07-14',
        })
        expect(regenerated).toMatchObject({
          kind: 'city_anniversary',
          name: ANNIVERSARY.name,
          sourceRuleId: rule.id,
        })
        expect(regenerated?.id).not.toBe(typed.id)
      })
    },
  )

  testWithPostgres(
    'só regenera dentro do horizonte da regra; fora dele, apaga e pronto',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { holidays } = await seedRule(database, tenant)
        const insert = (holidayOn: string) =>
          holidays.save({
            ...actorOf(tenant, `corr-${holidayOn}`),
            cityIbgeCode: CAMPINAS,
            holidayOn,
            name: 'Digitado',
          })
        const beyond = await insert('2040-07-14')
        const past = await insert('2024-07-14')
        const otherDay = await insert('2027-07-20')

        for (const holiday of [beyond, past, otherDay]) {
          await holidays.remove({
            ...actorOf(tenant, 'corr-delete'),
            currentYear: 2026,
            id: holiday.id,
          })
        }

        const dates = (await readHolidayRows(database, tenant.companyId)).map(
          (row) => row.holidayOn,
        )
        expect(dates).not.toContain('2040-07-14')
        expect(dates).not.toContain('2024-07-14')
        expect(dates).not.toContain('2027-07-20')
        expect(dates).toHaveLength(11)
      })
    },
  )
})
