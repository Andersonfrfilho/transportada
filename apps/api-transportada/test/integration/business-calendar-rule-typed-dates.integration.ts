/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3b: a data digitada sobre o dia da regra vira do operador (adoção) e, depois, editar ou
 * apagar a regra a deixa no dia antigo. A resposta diz quantas ficaram, e editar a regra não mexe nas
 * datas geradas de anos que já passaram.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  readAudits,
  readHolidayRows,
  SAO_PAULO,
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

function repositoriesOf(database: TestDatabase) {
  return {
    holidays: new DrizzleMunicipalHolidayRepository(database.db),
    rules: new DrizzleMunicipalHolidayRuleRepository(database.db),
  }
}

function typedOn(input: {
  readonly cityIbgeCode?: string
  readonly holidayOn: string
  readonly tenant: Tenant
}) {
  return {
    ...actorOf(input.tenant, `typed-${input.holidayOn}`),
    cityIbgeCode: input.cityIbgeCode ?? CAMPINAS,
    holidayOn: input.holidayOn,
    name: 'Digitada',
  }
}

describe('editar a regra não mexe em ano que já passou (spec 238 T1.3b)', () => {
  testWithPostgres(
    'regra criada em 2026 e editada em 2027 mantém a linha de 2026 e regenera de 2027 em diante',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { rules } = repositoriesOf(database)
        const { rule } = await rules.create({
          ...actorOf(tenant, 'create'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })

        const edited = await rules.update({
          ...actorOf(tenant, 'edit'),
          changes: { day: 15 },
          currentYear: 2027,
          id: rule.id,
        })

        expect(edited?.materializedThroughYear).toBe(2037)
        const dates = (await readHolidayRows(database, tenant.companyId)).map(
          (row) => row.holidayOn,
        )
        expect(dates).toEqual([
          '2026-07-14',
          ...Array.from({ length: 11 }, (_unused, index) => `${2027 + index}-07-15`),
        ])
      })
    },
  )
})

describe('a data digitada que fica para trás (spec 238 T1.3b)', () => {
  testWithPostgres(
    'o PATCH conta as digitadas no dia antigo, do ano corrente em diante, só da cidade e da empresa',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const other = await seedTenant(database)
        const { holidays, rules } = repositoriesOf(database)
        const { rule } = await rules.create({
          ...actorOf(tenant, 'create'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })
        for (const holidayOn of ['2027-07-14', '2029-07-14', '2025-07-14']) {
          await holidays.save(typedOn({ holidayOn, tenant }))
        }
        await holidays.save(typedOn({ cityIbgeCode: SAO_PAULO, holidayOn: '2027-07-14', tenant }))
        await holidays.save(typedOn({ holidayOn: '2027-07-14', tenant: other }))

        const edited = await rules.update({
          ...actorOf(tenant, 'edit'),
          changes: { day: 15 },
          currentYear: 2026,
          id: rule.id,
        })

        expect(edited?.typedHolidaysKept).toBe(2)
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.at(-1)?.metadata).toMatchObject({ typedHolidaysKept: 2 })
      })
    },
  )

  testWithPostgres('29/02 conta no dia 29/02 e em nenhum outro', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const { holidays, rules } = repositoriesOf(database)
      const { rule } = await rules.create({
        ...actorOf(tenant, 'create'),
        ...ANNIVERSARY,
        currentYear: 2026,
        day: 29,
        month: 2,
      })
      await holidays.save(typedOn({ holidayOn: '2028-02-29', tenant }))
      await holidays.save(typedOn({ holidayOn: '2028-02-28', tenant }))
      await holidays.save(typedOn({ holidayOn: '2028-03-29', tenant }))

      const [listed] = await rules.list({ companyId: tenant.companyId, currentYear: 2026 })

      expect(listed).toMatchObject({ id: rule.id, typedHolidaysKept: 1 })
    })
  })

  testWithPostgres('a leitura traz a contagem de cada regra, e a cidade filtra', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const { holidays, rules } = repositoriesOf(database)
      await rules.create({ ...actorOf(tenant, 'c1'), ...ANNIVERSARY, currentYear: 2026 })
      await rules.create({
        ...actorOf(tenant, 'c2'),
        ...ANNIVERSARY,
        cityIbgeCode: SAO_PAULO,
        currentYear: 2026,
        day: 25,
        month: 1,
      })
      await holidays.save(typedOn({ holidayOn: '2027-07-14', tenant }))
      await holidays.save(typedOn({ holidayOn: '2028-07-14', tenant }))
      await holidays.save(typedOn({ cityIbgeCode: SAO_PAULO, holidayOn: '2027-01-25', tenant }))
      await holidays.save(typedOn({ cityIbgeCode: SAO_PAULO, holidayOn: '2025-01-25', tenant }))

      const all = await rules.list({ companyId: tenant.companyId, currentYear: 2026 })
      const campinas = await rules.list({
        cityIbgeCode: CAMPINAS,
        companyId: tenant.companyId,
        currentYear: 2026,
      })

      expect(all.map((rule) => [rule.cityIbgeCode, rule.typedHolidaysKept])).toEqual([
        [CAMPINAS, 2],
        [SAO_PAULO, 1],
      ])
      expect(campinas.map((rule) => rule.typedHolidaysKept)).toEqual([2])
    })
  })

  testWithPostgres('apagar a regra audita quantas digitadas ficaram no dia dela', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const { holidays, rules } = repositoriesOf(database)
      const { rule } = await rules.create({
        ...actorOf(tenant, 'create'),
        ...ANNIVERSARY,
        currentYear: 2026,
      })
      await holidays.save(typedOn({ holidayOn: '2027-07-14', tenant }))

      await rules.remove({ ...actorOf(tenant, 'remove'), currentYear: 2026, id: rule.id })

      const remaining = await readHolidayRows(database, tenant.companyId)
      expect(remaining.map((row) => row.holidayOn)).toEqual(['2027-07-14'])
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.at(-1)).toMatchObject({ action: 'municipal-holiday-rule.deleted' })
      expect(audits.at(-1)?.metadata).toMatchObject({
        generatedHolidaysRemoved: 10,
        typedHolidaysKept: 1,
      })
    })
  })

  testWithPostgres(
    'adotar com o mesmo nome e tipo da regra continua sendo adoção e audita',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const { holidays, rules } = repositoriesOf(database)
        const { rule } = await rules.create({
          ...actorOf(tenant, 'create'),
          ...ANNIVERSARY,
          currentYear: 2026,
        })

        const saved = await holidays.save({
          ...typedOn({ holidayOn: '2027-07-14', tenant }),
          kind: ANNIVERSARY.kind,
          name: ANNIVERSARY.name,
        })

        expect(saved.adoptedFromRuleId).toBe(rule.id)
        expect(saved.holiday.generatedByRuleId).toBeNull()
        expect((await readAudits(database, tenant.companyId)).map((audit) => audit.action)).toEqual(
          ['municipal-holiday-rule.created', 'municipal-holiday.saved'],
        )
      })
    },
  )
})
