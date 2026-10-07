/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o feriado estadual e a configuração do sábado contra Postgres. A escrita e a linha de
 * `audit_logs` vivem na mesma transação.
 */
import { describe, expect, test } from 'bun:test'

import {
  StateHolidayConflictError,
  StateHolidayRecurrenceMismatchError,
} from '../../src/business-calendar/domain/business-calendar-rule.error.js'
import { DrizzleBusinessCalendarSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar-settings.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  companyBusinessCalendarSettings,
  stateHolidays,
} from '../../src/database/database.schema.js'
import {
  actorOf,
  databaseUrl,
  readAudits,
  seedTenant,
  withBusinessCalendarDatabase,
} from '../fixtures/business-calendar-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const ONCE = {
  holidayOn: '2026-07-09',
  name: 'Revolução',
  recurrence: 'once',
  stateIbgeCode: '35',
} as const
const YEARLY = {
  day: 9,
  month: 7,
  name: 'Revolução',
  recurrence: 'yearly',
  stateIbgeCode: '35',
} as const

describe('o feriado estadual (spec 238 T1.3)', () => {
  testWithPostgres('grava nas duas formas e audita com ator, alvo e IP', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleStateHolidayRepository(database.db)

      const once = await repository.create({ ...actorOf(tenant, 'c1'), ...ONCE })
      const yearly = await repository.create({ ...actorOf(tenant, 'c2'), ...YEARLY })

      expect(once).toMatchObject({ holidayOn: '2026-07-09', recurrence: 'once' })
      expect(yearly).toMatchObject({ day: 9, month: 7, recurrence: 'yearly' })
      const [audit] = await readAudits(database, tenant.companyId)
      expect(audit).toMatchObject({
        action: 'state-holiday.created',
        actorUserId: tenant.userId,
        entityId: once.id,
        permission: 'settings.manage',
        targetType: 'state_holiday',
      })
      expect(audit?.metadata).toMatchObject({ ipAddress: '203.0.113.7' })
    })
  })

  testWithPostgres('repetir a mesma data na mesma UF é conflito; UF diferente não', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleStateHolidayRepository(database.db)
      await repository.create({ ...actorOf(tenant, 'c1'), ...ONCE })
      await repository.create({ ...actorOf(tenant, 'c2'), ...YEARLY })

      await expect(repository.create({ ...actorOf(tenant, 'c3'), ...ONCE })).rejects.toBeInstanceOf(
        StateHolidayConflictError,
      )
      await expect(
        repository.create({ ...actorOf(tenant, 'c4'), ...YEARLY }),
      ).rejects.toBeInstanceOf(StateHolidayConflictError)
      await repository.create({ ...actorOf(tenant, 'c5'), ...ONCE, stateIbgeCode: '33' })

      expect(await repository.list({ companyId: tenant.companyId })).toHaveLength(3)
      expect(
        await repository.list({ companyId: tenant.companyId, stateIbgeCode: '33' }),
      ).toHaveLength(1)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(3)
    })
  })

  testWithPostgres('edita dentro da forma, recusa a troca de forma e a colisão', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleStateHolidayRepository(database.db)
      const once = await repository.create({ ...actorOf(tenant, 'c1'), ...ONCE })
      await repository.create({ ...actorOf(tenant, 'c2'), ...ONCE, holidayOn: '2026-08-01' })

      const renamed = await repository.update({
        ...actorOf(tenant, 'c3'),
        changes: { holidayOn: '2026-09-09', name: 'Outro nome', recurrence: 'once' },
        id: once.id,
      })

      expect(renamed).toMatchObject({ holidayOn: '2026-09-09', name: 'Outro nome' })
      await expect(
        repository.update({
          ...actorOf(tenant, 'c4'),
          changes: { holidayOn: '2026-08-01', recurrence: 'once' },
          id: once.id,
        }),
      ).rejects.toBeInstanceOf(StateHolidayConflictError)
      await expect(
        repository.update({
          ...actorOf(tenant, 'c5'),
          changes: { month: 7, recurrence: 'yearly' },
          id: once.id,
        }),
      ).rejects.toBeInstanceOf(StateHolidayRecurrenceMismatchError)
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.at(-1)).toMatchObject({ action: 'state-holiday.updated' })
      expect(audits.at(-1)?.beforeSnapshot).toMatchObject({ holidayOn: '2026-07-09' })
    })
  })

  testWithPostgres('apagar audita uma vez; apagar o que não existe é no-op', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleStateHolidayRepository(database.db)
      const created = await repository.create({ ...actorOf(tenant, 'c1'), ...ONCE })

      await repository.remove({ ...actorOf(tenant, 'c2'), id: created.id })
      await repository.remove({ ...actorOf(tenant, 'c3'), id: created.id })

      expect(await database.db.select().from(stateHolidays)).toHaveLength(0)
      expect((await readAudits(database, tenant.companyId)).map((audit) => audit.action)).toEqual([
        'state-holiday.created',
        'state-holiday.deleted',
      ])
    })
  })
})

describe('a configuração do sábado (spec 238 T1.3)', () => {
  testWithPostgres('sem linha é nulo; grava, regrava e audita antes e depois', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleBusinessCalendarSettingsRepository(database.db)
      expect(await repository.find({ companyId: tenant.companyId })).toBeNull()

      const first = await repository.save({ ...actorOf(tenant, 'c1'), saturdayIsBusinessDay: true })
      const second = await repository.save({
        ...actorOf(tenant, 'c2'),
        saturdayIsBusinessDay: false,
      })

      expect(first.saturdayIsBusinessDay).toBe(true)
      expect(second.saturdayIsBusinessDay).toBe(false)
      expect(await database.db.select().from(companyBusinessCalendarSettings)).toHaveLength(1)
      const audits = await readAudits(database, tenant.companyId)
      expect(audits.map((audit) => audit.action)).toEqual([
        'company-business-calendar-settings.saved',
        'company-business-calendar-settings.saved',
      ])
      expect(audits[0]?.beforeSnapshot).toBeNull()
      expect(audits[1]?.beforeSnapshot).toMatchObject({ saturdayIsBusinessDay: true })
      expect(audits[1]?.afterSnapshot).toMatchObject({ saturdayIsBusinessDay: false })
      expect(audits[1]).toMatchObject({ entityId: tenant.companyId, correlationId: 'c2' })
    })
  })

  testWithPostgres('a falha depois da auditoria desfaz a escrita', async () => {
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
        new DrizzleBusinessCalendarSettingsRepository(failing as never).save({
          ...actorOf(tenant, 'c1'),
          saturdayIsBusinessDay: true,
        }),
      ).rejects.toThrow('simulated failure')

      expect(await database.db.select().from(companyBusinessCalendarSettings)).toHaveLength(0)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})
