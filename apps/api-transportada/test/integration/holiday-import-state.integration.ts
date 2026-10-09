/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4): as escritas da 238 sobre o feriado ESTADUAL importado (sempre `once`, D6).
 * `POST` na mesma data e `PATCH` adotam; `DELETE` desliga (supressão da UF + auditoria, só de hoje em diante).
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  actorOf,
  databaseUrl,
  readAudits,
  seedTenant,
  withBusinessCalendarDatabase,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  findStateHolidayRow,
  readSuppressions,
  seedImportedStateHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const SAO_PAULO_STATE = '35'
const TODAY = '2026-10-09'
const FUTURE_DAY = '2026-11-20'
const PAST_DAY = '2026-10-08'

describe('POST na data de um feriado estadual importado é adoção (spec 252 T4.1)', () => {
  testWithPostgres(
    'o mesmo nome adota e responde "já existia" (200): o id é o da linha importada',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const imported = await seedImportedStateHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: SAO_PAULO_STATE,
          name: 'Consciência Negra',
        })

        const result = await states.create({
          ...actorOf(tenant, 'adopt-same'),
          holidayOn: FUTURE_DAY,
          name: 'Consciência Negra',
          recurrence: 'once',
          stateIbgeCode: SAO_PAULO_STATE,
        })

        expect(result).toMatchObject({ created: false, holiday: { id: imported.id } })
        const row = await findStateHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: FUTURE_DAY,
          stateIbgeCode: SAO_PAULO_STATE,
        })
        expect(row?.providerEntryId).toBeNull()
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({ action: 'state-holiday.updated' })
        expect(audits[0]?.metadata).toMatchObject({ adoptedFromImport: true })
        expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres('outro nome troca o nome em vez de dar 409, e adota', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      await seedImportedStateHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })

      const result = await states.create({
        ...actorOf(tenant, 'adopt-other'),
        holidayOn: FUTURE_DAY,
        name: 'Nome do operador',
        recurrence: 'once',
        stateIbgeCode: SAO_PAULO_STATE,
      })

      expect(result.created).toBe(false)
      expect(result.holiday).toMatchObject({ name: 'Nome do operador' })
      const row = await findStateHolidayRow(database, {
        companyId: tenant.companyId,
        holidayOn: FUTURE_DAY,
        stateIbgeCode: SAO_PAULO_STATE,
      })
      expect(row).toMatchObject({ name: 'Nome do operador', providerEntryId: null })
    })
  })

  testWithPostgres('a digitada com outro nome segue sendo 409', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const base = {
        ...actorOf(tenant, 'typed'),
        holidayOn: FUTURE_DAY,
        recurrence: 'once',
        stateIbgeCode: SAO_PAULO_STATE,
      } as const
      await states.create({ ...base, name: 'Primeiro' })

      const failure = await states.create({ ...base, name: 'Segundo' }).then(
        () => undefined,
        (error: unknown) => error as { code: string; status: number },
      )

      expect(failure).toMatchObject({ code: 'STATE_HOLIDAY_CONFLICT', status: 409 })
    })
  })
})

describe('PATCH num feriado estadual importado (spec 252 T4.1, M1)', () => {
  testWithPostgres('mudar o nome adota: zera o vínculo com o fornecedor', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const imported = await seedImportedStateHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })

      await states.update({
        ...actorOf(tenant, 'patch-name'),
        changes: { name: 'Renomeado', recurrence: 'once' },
        id: imported.id,
      })
      await states.update({
        ...actorOf(tenant, 'patch-same-date'),
        changes: { holidayOn: FUTURE_DAY, recurrence: 'once' },
        id: imported.id,
      })

      const row = await findStateHolidayRow(database, {
        companyId: tenant.companyId,
        holidayOn: FUTURE_DAY,
        stateIbgeCode: SAO_PAULO_STATE,
      })
      expect(row).toMatchObject({ name: 'Renomeado', providerEntryId: null })
      const audits = await readAudits(database, tenant.companyId)
      expect(audits[0]?.metadata).toMatchObject({ adoptedFromImport: true })
    })
  })

  testWithPostgres(
    'mudar a DATA da importada é 409 HOLIDAY_IMPORT_DATE_LOCKED: desligue e cadastre, nada muda',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const imported = await seedImportedStateHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })

        const failure = await states
          .update({
            ...actorOf(tenant, 'patch-date'),
            changes: { holidayOn: '2026-12-09', name: 'Outro nome', recurrence: 'once' },
            id: imported.id,
          })
          .then(
            () => undefined,
            (error: unknown) => error as { code: string; status: number },
          )

        expect(failure).toMatchObject({ code: 'HOLIDAY_IMPORT_DATE_LOCKED', status: 409 })
        expect(
          await findStateHolidayRow(database, {
            companyId: tenant.companyId,
            holidayOn: FUTURE_DAY,
            stateIbgeCode: SAO_PAULO_STATE,
          }),
        ).toMatchObject({ name: imported.name, providerEntryId: imported.providerEntryId })
        expect(await readAudits(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres('a digitada continua podendo mudar de data', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const { holiday } = await states.create({
        ...actorOf(tenant, 'typed'),
        holidayOn: FUTURE_DAY,
        name: 'Digitada',
        recurrence: 'once',
        stateIbgeCode: SAO_PAULO_STATE,
      })

      const moved = await states.update({
        ...actorOf(tenant, 'move'),
        changes: { holidayOn: '2026-12-09', recurrence: 'once' },
        id: holiday.id,
      })

      expect(moved).toMatchObject({ holidayOn: '2026-12-09' })
    })
  })
})

describe('DELETE num feriado estadual importado é desligar (spec 252 T4.1, CA5)', () => {
  testWithPostgres(
    'apaga a linha, grava a supressão da UF e a auditoria do ator, e não volta',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const imported = await seedImportedStateHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })

        await states.remove({ ...actorOf(tenant, 'disable'), id: imported.id, today: TODAY })

        expect(
          await findStateHolidayRow(database, {
            companyId: tenant.companyId,
            holidayOn: FUTURE_DAY,
            stateIbgeCode: SAO_PAULO_STATE,
          }),
        ).toBeUndefined()
        expect(await readSuppressions(database, tenant.companyId)).toEqual([
          expect.objectContaining({
            holidayOn: FUTURE_DAY,
            ibgeCode: SAO_PAULO_STATE,
            scope: 'state',
            suppressedByUserId: tenant.userId,
          }),
        ])
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({
          action: 'holiday-import.disabled',
          actorUserId: tenant.userId,
          entityId: imported.id,
          entityType: 'state_holiday',
        })
      })
    },
  )

  testWithPostgres('data passada não desliga: 409 e nada muda (D7)', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const imported = await seedImportedStateHoliday(database, tenant, {
        holidayOn: PAST_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })

      const failure = await states
        .remove({ ...actorOf(tenant, 'disable-past'), id: imported.id, today: TODAY })
        .then(
          () => undefined,
          (error: unknown) => error as { code: string; status: number },
        )

      expect(failure).toMatchObject({ code: 'HOLIDAY_IMPORT_PAST_DATE', status: 409 })
      expect(
        await findStateHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: PAST_DAY,
          stateIbgeCode: SAO_PAULO_STATE,
        }),
      ).toMatchObject({ providerEntryId: imported.providerEntryId })
      expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      expect(await readAudits(database, tenant.companyId)).toEqual([])
    })
  })

  testWithPostgres(
    'apagar a digitada de hoje em diante grava a supressão da data, com o id na auditoria (M2)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const { holiday } = await states.create({
          ...actorOf(tenant, 'typed'),
          holidayOn: FUTURE_DAY,
          name: 'Digitada',
          recurrence: 'once',
          stateIbgeCode: SAO_PAULO_STATE,
        })

        await states.remove({ ...actorOf(tenant, 'delete'), id: holiday.id, today: TODAY })

        const suppressions = await readSuppressions(database, tenant.companyId)
        expect(suppressions).toEqual([
          expect.objectContaining({
            holidayOn: FUTURE_DAY,
            ibgeCode: SAO_PAULO_STATE,
            scope: 'state',
          }),
        ])
        const audit = (await readAudits(database, tenant.companyId)).at(-1)
        expect(audit).toMatchObject({ action: 'state-holiday.deleted' })
        expect(audit?.metadata).toMatchObject({ suppressionId: suppressions[0]?.id })
      })
    },
  )

  testWithPostgres(
    'a adotada também: depois de adotar, apagar não deixa a importação trazer de volta',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const imported = await seedImportedStateHoliday(database, tenant, {
          holidayOn: FUTURE_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })
        await states.update({
          ...actorOf(tenant, 'adopt'),
          changes: { name: 'Adotada', recurrence: 'once' },
          id: imported.id,
        })

        await states.remove({ ...actorOf(tenant, 'delete'), id: imported.id, today: TODAY })

        expect(await readSuppressions(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres('data passada, e o "todo ano" (sem data), não gravam supressão', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const past = await states.create({
        ...actorOf(tenant, 'past'),
        holidayOn: PAST_DAY,
        name: 'Passada',
        recurrence: 'once',
        stateIbgeCode: SAO_PAULO_STATE,
      })
      const yearly = await states.create({
        ...actorOf(tenant, 'yearly'),
        day: 20,
        month: 11,
        name: 'Todo ano',
        recurrence: 'yearly',
        stateIbgeCode: SAO_PAULO_STATE,
      })

      await states.remove({ ...actorOf(tenant, 'd1'), id: past.holiday.id, today: TODAY })
      await states.remove({ ...actorOf(tenant, 'd2'), id: yearly.holiday.id, today: TODAY })

      expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.at(-1)?.metadata).toMatchObject({ suppressionId: null })
    })
  })

  testWithPostgres('a empresa B não desliga o feriado estadual importado da A', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenantA = await seedTenant(database)
      const tenantB = await seedTenant(database)
      const states = new DrizzleStateHolidayRepository(database.db)
      const imported = await seedImportedStateHoliday(database, tenantA, {
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })

      await states.remove({ ...actorOf(tenantB, 'b-disable'), id: imported.id, today: TODAY })

      expect(
        await findStateHolidayRow(database, {
          companyId: tenantA.companyId,
          holidayOn: FUTURE_DAY,
          stateIbgeCode: SAO_PAULO_STATE,
        }),
      ).toMatchObject({ providerEntryId: imported.providerEntryId })
      expect(await readSuppressions(database, tenantA.companyId)).toEqual([])
      expect(await readSuppressions(database, tenantB.companyId)).toEqual([])
      expect(await readAudits(database, tenantB.companyId)).toEqual([])
    })
  })
})
