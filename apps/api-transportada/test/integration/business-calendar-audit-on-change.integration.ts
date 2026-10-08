/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3b: a trilha de auditoria só ganha linha quando algo mudou (como o `PUT` do perfil da
 * spec 237), e a geração dos próximos anos mira a coleção de regras da empresa, não uma regra que não
 * existe. O feriado estadual idêntico é a mesma escrita, como o municipal.
 */
import { describe, expect, test } from 'bun:test'

import { StateHolidayConflictError } from '../../src/business-calendar/domain/business-calendar-rule.error.js'
import { DrizzleBusinessCalendarSettingsRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar-settings.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  readAudits,
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
const STATE_ONCE = {
  holidayOn: '2026-07-09',
  name: 'Revolução',
  recurrence: 'once',
  stateIbgeCode: '35',
} as const
const STATE_YEARLY = {
  day: 9,
  month: 7,
  name: 'Revolução',
  recurrence: 'yearly',
  stateIbgeCode: '35',
} as const

describe('gerar os próximos anos audita só quando algo mudou (spec 238 T1.3b)', () => {
  testWithPostgres('sem data nova e sem regra avançada, nenhuma linha de auditoria', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
      await rules.create({ ...actorOf(tenant, 'c1'), ...ANNIVERSARY, currentYear: 2026 })

      const again = await rules.materialize({ ...actorOf(tenant, 'c2'), currentYear: 2026 })

      expect(again).toEqual({ holidaysCreated: 0, rulesProcessed: 1 })
      expect((await readAudits(database, tenant.companyId)).map((audit) => audit.action)).toEqual([
        'municipal-holiday-rule.created',
      ])
    })
  })

  testWithPostgres('com data nova, audita contra a coleção de regras da empresa', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
      await rules.create({ ...actorOf(tenant, 'c1'), ...ANNIVERSARY, currentYear: 2026 })

      await rules.materialize({ ...actorOf(tenant, 'c2'), currentYear: 2027 })

      const audit = (await readAudits(database, tenant.companyId)).at(-1)
      expect(audit).toMatchObject({
        action: 'municipal-holiday-rule.materialized',
        entityId: tenant.companyId,
        entityType: 'municipal_holiday_rules',
        targetId: tenant.companyId,
        targetType: 'municipal_holiday_rules',
      })
      expect(audit?.metadata).toMatchObject({ holidaysCreated: 1, throughYear: 2037 })
    })
  })

  testWithPostgres(
    'regra que só avança o ano gerado (29/02 não bissexto) também audita',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
        await rules.create({
          ...actorOf(tenant, 'c1'),
          ...ANNIVERSARY,
          currentYear: 2026,
          day: 29,
          month: 2,
        })

        const advanced = await rules.materialize({ ...actorOf(tenant, 'c2'), currentYear: 2027 })

        expect(advanced).toEqual({ holidaysCreated: 0, rulesProcessed: 1 })
        expect((await readAudits(database, tenant.companyId)).at(-1)).toMatchObject({
          action: 'municipal-holiday-rule.materialized',
        })
      })
    },
  )

  testWithPostgres('empresa sem regra: nada a gerar e nada a auditar', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)

      await rules.materialize({ ...actorOf(tenant, 'c1'), currentYear: 2026 })

      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)
    })
  })
})

describe('o sábado só audita quando muda (spec 238 T1.3b)', () => {
  testWithPostgres('o mesmo valor de novo não grava linha, nem mexe em updated_at', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const settings = new DrizzleBusinessCalendarSettingsRepository(database.db)
      const first = await settings.save({ ...actorOf(tenant, 'c1'), saturdayIsBusinessDay: true })

      const again = await settings.save({ ...actorOf(tenant, 'c2'), saturdayIsBusinessDay: true })

      expect(again).toEqual(first)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('o primeiro PUT grava a linha e audita, mesmo com o valor padrão', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const settings = new DrizzleBusinessCalendarSettingsRepository(database.db)

      await settings.save({ ...actorOf(tenant, 'c1'), saturdayIsBusinessDay: false })

      expect(await settings.find({ companyId: tenant.companyId })).not.toBeNull()
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })
})

describe('o feriado estadual idêntico é a mesma escrita (spec 238 T1.3b)', () => {
  testWithPostgres(
    'repetir igual devolve o existente, sem auditar; nome diferente é conflito',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleStateHolidayRepository(database.db)

        for (const holiday of [STATE_ONCE, STATE_YEARLY]) {
          const first = await repository.create({ ...actorOf(tenant, 'c1'), ...holiday })
          const again = await repository.create({ ...actorOf(tenant, 'c2'), ...holiday })

          expect(first.created).toBe(true)
          expect(again).toEqual({ created: false, holiday: first.holiday })
          await expect(
            repository.create({ ...actorOf(tenant, 'c3'), ...holiday, name: 'Outro nome' }),
          ).rejects.toBeInstanceOf(StateHolidayConflictError)
        }
        expect((await readAudits(database, tenant.companyId)).map((audit) => audit.action)).toEqual(
          ['state-holiday.created', 'state-holiday.created'],
        )
      })
    },
  )
})
