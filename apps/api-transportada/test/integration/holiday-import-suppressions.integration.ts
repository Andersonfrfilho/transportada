/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4, CA5): desligar e restaurar o feriado importado pela rota da gestão. Desligar
 * apaga a linha, grava a supressão e a auditoria do ator na mesma transação; restaurar apaga a supressão
 * (o feriado volta no ciclo seguinte da rotina). Id de outra empresa é ausência, nunca 409.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleHolidayImportSuppressionRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-import-suppression.repository.js'
import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
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
  findStateHolidayRow,
  readSuppressions,
  seedImportedMunicipalHoliday,
  seedImportedStateHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const SAO_PAULO_STATE = '35'
const TODAY = '2026-10-09'
const FUTURE_DAY = '2026-11-20'
const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff'

function failureOf(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (error: unknown) => error as { code: string; status: number },
  )
}

describe('desligar o feriado importado pela rota da gestão (spec 252 T4.1, CA5)', () => {
  testWithPostgres('municipal: apaga a linha, grava a supressão e a auditoria', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const imported = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
      })

      const suppression = await repository.disable({
        ...actorOf(tenant, 'disable-city'),
        currentYear: 2026,
        holidayId: imported.id,
        scope: 'city',
        today: TODAY,
      })

      expect(suppression).toMatchObject({
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
        scope: 'city',
      })
      expect(
        await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: FUTURE_DAY }),
      ).toBeUndefined()
      expect(await readSuppressions(database, tenant.companyId)).toHaveLength(1)
      const audits = await readAudits(database, tenant.companyId)
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        action: 'holiday-import.disabled',
        actorUserId: tenant.userId,
        entityId: imported.id,
      })
      expect(audits[0]?.metadata).toMatchObject({ ipAddress: '203.0.113.7', scope: 'city' })
    })
  })

  testWithPostgres('estadual: apaga a linha e grava a supressão da UF', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const imported = await seedImportedStateHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })

      const suppression = await repository.disable({
        ...actorOf(tenant, 'disable-state'),
        currentYear: 2026,
        holidayId: imported.id,
        scope: 'state',
        today: TODAY,
      })

      expect(suppression).toMatchObject({
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
        scope: 'state',
      })
      expect(
        await findStateHolidayRow(database, {
          companyId: tenant.companyId,
          holidayOn: FUTURE_DAY,
          stateIbgeCode: SAO_PAULO_STATE,
        }),
      ).toBeUndefined()
    })
  })

  testWithPostgres(
    'a linha digitada não se desliga: 409 HOLIDAY_NOT_IMPORTED, nada muda (o caminho é o DELETE)',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const { holiday } = await holidays.save({
          ...actorOf(tenant, 'typed'),
          cityIbgeCode: CAMPINAS,
          holidayOn: FUTURE_DAY,
          name: 'Digitada',
        })

        const failure = await failureOf(
          repository.disable({
            ...actorOf(tenant, 'disable-typed'),
            currentYear: 2026,
            holidayId: holiday.id,
            scope: 'city',
            today: TODAY,
          }),
        )

        expect(failure).toMatchObject({ code: 'HOLIDAY_NOT_IMPORTED', status: 409 })
        expect(
          await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: FUTURE_DAY }),
        ).toBeDefined()
        expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres('id que não existe é 404 com código do escopo', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const base = { ...actorOf(tenant, 'missing'), currentYear: 2026, today: TODAY }

      const city = await failureOf(
        repository.disable({ ...base, holidayId: UNKNOWN_ID, scope: 'city' }),
      )
      const state = await failureOf(
        repository.disable({ ...base, holidayId: UNKNOWN_ID, scope: 'state' }),
      )

      expect(city).toMatchObject({ code: 'MUNICIPAL_HOLIDAY_NOT_FOUND', status: 404 })
      expect(state).toMatchObject({ code: 'STATE_HOLIDAY_NOT_FOUND', status: 404 })
    })
  })

  testWithPostgres(
    'id de outra empresa é o mesmo 404: nada confirma que existe, nada muda',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenantA = await seedTenant(database)
        const tenantB = await seedTenant(database)
        const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
        })

        const failure = await failureOf(
          repository.disable({
            ...actorOf(tenantB, 'b-disable'),
            currentYear: 2026,
            holidayId: imported.id,
            scope: 'city',
            today: TODAY,
          }),
        )

        expect(failure).toMatchObject({ code: 'MUNICIPAL_HOLIDAY_NOT_FOUND', status: 404 })
        expect(
          await findHolidayRow(database, { companyId: tenantA.companyId, holidayOn: FUTURE_DAY }),
        ).toBeDefined()
        expect(await readSuppressions(database, tenantA.companyId)).toEqual([])
        expect(await readAudits(database, tenantB.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres('data passada: 409 HOLIDAY_IMPORT_PAST_DATE e nada muda (D7)', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const imported = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: '2026-10-08',
        ibgeCode: CAMPINAS,
      })

      const failure = await failureOf(
        repository.disable({
          ...actorOf(tenant, 'past'),
          currentYear: 2026,
          holidayId: imported.id,
          scope: 'city',
          today: TODAY,
        }),
      )

      expect(failure).toMatchObject({ code: 'HOLIDAY_IMPORT_PAST_DATE', status: 409 })
      expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      expect(await readAudits(database, tenant.companyId)).toEqual([])
    })
  })
})

describe('restaurar o feriado desligado (spec 252 T4.1, CA5)', () => {
  testWithPostgres('apaga a supressão e audita; a linha não volta na hora', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const imported = await seedImportedMunicipalHoliday(database, tenant, {
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
      })
      const suppression = await repository.disable({
        ...actorOf(tenant, 'disable'),
        currentYear: 2026,
        holidayId: imported.id,
        scope: 'city',
        today: TODAY,
      })

      await repository.restore({ ...actorOf(tenant, 'restore'), id: suppression.id })

      expect(await readSuppressions(database, tenant.companyId)).toEqual([])
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.map((audit) => audit.action)).toEqual([
        'holiday-import.disabled',
        'holiday-import.restored',
      ])
      expect(audits[1]).toMatchObject({
        actorUserId: tenant.userId,
        entityId: suppression.id,
        entityType: 'holiday_import_suppression',
      })
      expect(audits[1]?.beforeSnapshot).toMatchObject({ holidayOn: FUTURE_DAY, scope: 'city' })
      expect(
        await findHolidayRow(database, { companyId: tenant.companyId, holidayOn: FUTURE_DAY }),
      ).toBeUndefined()
    })
  })

  testWithPostgres(
    'restaurar o que não existe ou é de outra empresa é no-op: sem auditoria, sem tocar',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenantA = await seedTenant(database)
        const tenantB = await seedTenant(database)
        const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
        const imported = await seedImportedMunicipalHoliday(database, tenantA, {
          holidayOn: FUTURE_DAY,
          ibgeCode: CAMPINAS,
        })
        const suppression = await repository.disable({
          ...actorOf(tenantA, 'a-disable'),
          currentYear: 2026,
          holidayId: imported.id,
          scope: 'city',
          today: TODAY,
        })

        await repository.restore({ ...actorOf(tenantB, 'b-restore'), id: suppression.id })
        await repository.restore({ ...actorOf(tenantA, 'a-missing'), id: UNKNOWN_ID })

        expect(await readSuppressions(database, tenantA.companyId)).toHaveLength(1)
        expect(await readAudits(database, tenantB.companyId)).toEqual([])
        expect(await readAudits(database, tenantA.companyId)).toHaveLength(1)
      })
    },
  )
})

describe('listar as supressões (spec 252 T4.1)', () => {
  testWithPostgres('só as da empresa, por data e código', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenantA = await seedTenant(database)
      const tenantB = await seedTenant(database)
      const repository = new DrizzleHolidayImportSuppressionRepository(database.db)
      const later = await seedImportedMunicipalHoliday(database, tenantA, {
        holidayOn: '2026-12-08',
        ibgeCode: CAMPINAS,
      })
      const sooner = await seedImportedStateHoliday(database, tenantA, {
        holidayOn: FUTURE_DAY,
        ibgeCode: SAO_PAULO_STATE,
      })
      const foreign = await seedImportedMunicipalHoliday(database, tenantB, {
        holidayOn: FUTURE_DAY,
        ibgeCode: CAMPINAS,
      })
      const base = { currentYear: 2026, today: TODAY }
      await repository.disable({
        ...actorOf(tenantA, 'a1'),
        ...base,
        holidayId: later.id,
        scope: 'city',
      })
      await repository.disable({
        ...actorOf(tenantA, 'a2'),
        ...base,
        holidayId: sooner.id,
        scope: 'state',
      })
      await repository.disable({
        ...actorOf(tenantB, 'b1'),
        ...base,
        holidayId: foreign.id,
        scope: 'city',
      })

      const listed = await repository.list({ companyId: tenantA.companyId })

      expect(listed.map((item) => [item.scope, item.ibgeCode, item.holidayOn])).toEqual([
        ['state', SAO_PAULO_STATE, FUTURE_DAY],
        ['city', CAMPINAS, '2026-12-08'],
      ])
    })
  })
})
