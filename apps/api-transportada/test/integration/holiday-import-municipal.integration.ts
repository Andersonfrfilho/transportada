/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4): as escritas da 238 sobre o feriado municipal IMPORTADO. `POST` na mesma
 * data e `PATCH` são adoção (a linha vira do operador); `DELETE` é desligar (supressão + auditoria, só de
 * hoje em diante) e o feriado não volta; `typedHolidaysKept` só conta a digitada.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { municipalHolidays } from '../../src/database/database.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  findHolidayRow,
  readAudits,
  seedTenant,
  withBusinessCalendarDatabase,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  readSuppressions,
  seedImportedMunicipalHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const TODAY = '2026-10-09'
const FUTURE_DAY = '2026-11-20'
const PAST_DAY = '2026-10-08'

describe('POST na data de um feriado importado é adoção (spec 252 T4.1)', () => {
  testWithPostgres(
    'o mesmo nome também adota: a linha vira digitada e a entrada do cache fica',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
          name: 'Dia da Consciência',
        })

        const saved = await holidays.save({
          ...actorOf(tenant, 'adopt-same-name'),
          cityIbgeCode: CAMPINAS,
          holidayOn: FUTURE_DAY,
          name: 'Dia da Consciência',
        })

        expect(saved.holiday).toMatchObject({ generatedByRuleId: null, id: imported.id })
        const row = await findHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: FUTURE_DAY,
        })
        expect(row?.providerEntryId).toBeNull()
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({ action: 'municipal-holiday.saved' })
        expect(audits[0]?.metadata).toMatchObject({ adoptedFromImport: true })
        expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres('outro nome troca o nome e adota', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)
      await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
      })

      const saved = await holidays.save({
        ...actorOf(tenant, 'adopt-other-name'),
        cityIbgeCode: CAMPINAS,
        holidayOn: FUTURE_DAY,
        name: 'Nome do operador',
      })

      expect(saved.holiday.name).toBe('Nome do operador')
      const row = await findHolidayRow(database, {
        companyId: tenant.companyId,
        holidayOn: FUTURE_DAY,
      })
      expect(row).toMatchObject({ name: 'Nome do operador', providerEntryId: null })
    })
  })

  testWithPostgres(
    'depois de adotado, o mesmo cadastro de novo volta a ser no-op e não audita',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
          name: 'Igual',
        })
        const input = {
          ...actorOf(tenant, 'first'),
          cityIbgeCode: CAMPINAS,
          holidayOn: FUTURE_DAY,
          name: 'Igual',
        }

        await holidays.save(input)
        await holidays.save({ ...input, correlationId: 'second' })

        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )
})

describe('PATCH num feriado importado é adoção (spec 252 T4.1)', () => {
  testWithPostgres('mudar só o nome ou só o tipo zera o vínculo com o fornecedor', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)
      const byName = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
      })
      const byKind = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: '2026-12-08',
        ibgeCode: CAMPINAS,
      })

      await holidays.update({
        ...actorOf(tenant, 'patch-name'),
        changes: { name: 'Renomeado' },
        id: byName.id,
      })
      await holidays.update({
        ...actorOf(tenant, 'patch-kind'),
        changes: { kind: 'city_anniversary' },
        id: byKind.id,
      })

      const rows = await database.db
        .select()
        .from(municipalHolidays)
        .where(eq(municipalHolidays.companyId, tenant.companyId))
      expect(rows).toHaveLength(2)
      expect(rows.every((row) => row.providerEntryId === null)).toBe(true)
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.map((audit) => audit.action)).toEqual([
        'municipal-holiday.updated',
        'municipal-holiday.updated',
      ])
      expect(audits[0]?.metadata).toMatchObject({ adoptedFromImport: true })
    })
  })
})

describe('DELETE num feriado importado é desligar (spec 252 T4.1, CA5)', () => {
  testWithPostgres(
    'apaga a linha, grava a supressão e a auditoria do ator, e não volta',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
        })

        await holidays.remove({
          ...actorOf(tenant, 'disable'),
          currentYear: 2026,
          id: imported.id,
          today: TODAY,
        })

        expect(
          await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: FUTURE_DAY }),
        ).toBeUndefined()
        expect(await readSuppressions(database, tenant.companyId)).toEqual([
          expect.objectContaining({
            holidayOn: FUTURE_DAY,
            ibgeCode: CAMPINAS,
            scope: 'city',
            suppressedByUserId: tenant.userId,
          }),
        ])
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({
          action: 'holiday-import.disabled',
          actorUserId: tenant.userId,
          entityId: imported.id,
          entityType: 'municipal_holiday',
        })
        expect(audits[0]?.beforeSnapshot).toMatchObject({ holidayOn: FUTURE_DAY })
        expect(audits[0]?.afterSnapshot).toBeNull()
      })
    },
  )

  testWithPostgres('no próprio dia de hoje ainda desliga (hoje em diante)', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)
      const imported = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: TODAY,
        ibgeCode: CAMPINAS,
      })

      await holidays.remove({
        ...actorOf(tenant, 'disable-today'),
        currentYear: 2026,
        id: imported.id,
        today: TODAY,
      })

      expect(await readSuppressions(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres(
    'data passada não desliga: 409 com código estável e nada muda (D7)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: PAST_DAY,
          ibgeCode: CAMPINAS,
        })

        const failure = await holidays
          .remove({
            ...actorOf(tenant, 'disable-past'),
            currentYear: 2026,
            id: imported.id,
            today: TODAY,
          })
          .then(
            () => undefined,
            (error: unknown) => error as { code: string; status: number },
          )

        expect(failure).toMatchObject({ code: 'HOLIDAY_IMPORT_PAST_DATE', status: 409 })
        expect(
          await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: PAST_DAY }),
        ).toMatchObject({ providerEntryId: imported.providerEntryId })
        expect(await readSuppressions(database, tenant.companyId)).toEqual([])
        expect(await readAudits(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'a data da regra do mesmo dia é gerada de novo, como no DELETE da digitada',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: '2027-07-14',
          ibgeCode: CAMPINAS,
        })
        const { rule } = await rules.create({
          ...actorOf(tenant, 'rule'),
          cityIbgeCode: CAMPINAS,
          currentYear: 2026,
          day: 14,
          kind: 'city_anniversary',
          month: 7,
          name: 'Aniversário de Campinas',
        })

        await holidays.remove({
          ...actorOf(tenant, 'disable'),
          currentYear: 2026,
          id: imported.id,
          today: TODAY,
        })

        const regenerated = await findHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: '2027-07-14',
        })
        expect(regenerated).toMatchObject({
          name: 'Aniversário de Campinas',
          sourceRuleId: rule.id,
        })
        expect(regenerated?.providerEntryId).toBeNull()
        const audits = await readAudits(database, tenant.companyId)
        expect(audits.at(-1)?.metadata).toMatchObject({ regeneratedFromRuleId: rule.id })
      })
    },
  )

  testWithPostgres(
    'apagar a digitada de hoje em diante grava a supressão da data, com o id na auditoria (M2)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const { holiday } = await holidays.save({
          ...actorOf(tenant, 'typed'),
          cityIbgeCode: CAMPINAS,
          holidayOn: FUTURE_DAY,
          name: 'Digitada',
        })

        await holidays.remove({
          ...actorOf(tenant, 'delete-typed'),
          currentYear: 2026,
          id: holiday.id,
          today: TODAY,
        })

        const suppressions = await readSuppressions(database, tenant.companyId)
        expect(suppressions).toEqual([
          expect.objectContaining({ holidayOn: FUTURE_DAY, ibgeCode: CAMPINAS, scope: 'city' }),
        ])
        const audit = (await readAudits(database, tenant.companyId)).at(-1)
        expect(audit).toMatchObject({ action: 'municipal-holiday.deleted' })
        expect(audit?.metadata).toMatchObject({ suppressionId: suppressions[0]?.id })
      })
    },
  )

  testWithPostgres(
    'a adotada também: depois de adotar, apagar não deixa a importação trazer de volta',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
        })
        await holidays.update({
          ...actorOf(tenant, 'adopt'),
          changes: { name: 'Adotada' },
          id: imported.id,
        })

        await holidays.remove({
          ...actorOf(tenant, 'delete'),
          currentYear: 2026,
          id: imported.id,
          today: TODAY,
        })

        expect(await readSuppressions(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'data passada e código de cidade fora do padrão do cache não gravam supressão (e não quebram o DELETE)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const past = await holidays.save({
          ...actorOf(tenant, 'past'),
          cityIbgeCode: CAMPINAS,
          holidayOn: PAST_DAY,
          name: 'Passada',
        })
        const legacy = await holidays.save({
          ...actorOf(tenant, 'legacy'),
          cityIbgeCode: '0000000',
          holidayOn: FUTURE_DAY,
          name: 'Código antigo',
        })

        for (const { holiday } of [past, legacy]) {
          await holidays.remove({
            ...actorOf(tenant, `delete-${holiday.id}`),
            currentYear: 2026,
            id: holiday.id,
            today: TODAY,
          })
        }

        expect(await readSuppressions(database, tenant.companyId)).toEqual([])
        expect((await readAudits(database, tenant.companyId)).at(-1)?.metadata).toMatchObject({
          suppressionId: null,
        })
      })
    },
  )

  testWithPostgres(
    'a empresa B não desliga o feriado importado da A: sem 409 que confirme que existe',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenantA = await seedTenant(database)
        const tenantB = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
        })

        await holidays.remove({
          ...actorOf(tenantB, 'b-disable'),
          currentYear: 2026,
          id: imported.id,
          today: TODAY,
        })

        expect(
          await findHolidayRow(database, { companyId: tenantA.companyId, holidayOn: FUTURE_DAY }),
        ).toMatchObject({ providerEntryId: imported.providerEntryId })
        expect(await readSuppressions(database, tenantA.companyId)).toEqual([])
        expect(await readSuppressions(database, tenantB.companyId)).toEqual([])
        expect(await readAudits(database, tenantB.companyId)).toEqual([])
      })
    },
  )
})

describe('typedHolidaysKept só conta a digitada (spec 252 T4.1, ADR-0096 §6.4)', () => {
  testWithPostgres('a importada no dia da regra não conta; depois de adotada, conta', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)
      const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
      await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: '2027-07-14',
        ibgeCode: CAMPINAS,
      })
      const { rule } = await rules.create({
        ...actorOf(tenant, 'rule'),
        cityIbgeCode: CAMPINAS,
        currentYear: 2026,
        day: 14,
        kind: 'city_anniversary',
        month: 7,
        name: 'Aniversário de Campinas',
      })

      const before = await rules.list({ companyId: tenant.companyId, currentYear: 2026 })
      await holidays.save({
        ...actorOf(tenant, 'adopt'),
        cityIbgeCode: CAMPINAS,
        holidayOn: '2027-07-14',
        name: 'Adotada',
      })
      const after = await rules.list({ companyId: tenant.companyId, currentYear: 2026 })
      const edited = await rules.update({
        ...actorOf(tenant, 'edit-rule'),
        changes: { day: 15 },
        currentYear: 2026,
        id: rule.id,
      })

      expect(before[0]?.typedHolidaysKept).toBe(0)
      expect(after[0]?.typedHolidaysKept).toBe(1)
      expect(edited?.typedHolidaysKept).toBe(1)
      const ids = await database.db
        .select({ providerEntryId: municipalHolidays.providerEntryId })
        .from(municipalHolidays)
        .where(
          and(
            eq(municipalHolidays.companyId, tenant.companyId),
            eq(municipalHolidays.holidayOn, '2027-07-14'),
          ),
        )
      expect(ids).toEqual([{ providerEntryId: null }])
    })
  })

  testWithPostgres(
    'a importada que ficou no dia antigo da regra não vira "digitada que ficou"',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
        await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: '2027-07-14',
          ibgeCode: CAMPINAS,
        })
        const { rule } = await rules.create({
          ...actorOf(tenant, 'rule'),
          cityIbgeCode: CAMPINAS,
          currentYear: 2026,
          day: 14,
          kind: 'city_anniversary',
          month: 7,
          name: 'Aniversário de Campinas',
        })

        const edited = await rules.update({
          ...actorOf(tenant, 'edit-rule'),
          changes: { day: 15 },
          currentYear: 2026,
          id: rule.id,
        })

        expect(edited?.typedHolidaysKept).toBe(0)
      })
    },
  )
})
