/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 (lacuna da T5.2): `GET`, `POST` e `PATCH` de `/municipal-holidays` e `/state-holidays` dizem
 * a origem de cada linha — `imported` quando `provider_entry_id` está preenchido, `typed` no resto (a
 * gerada por regra inclusive, que já se distingue por `generatedByRuleId`). A resposta nunca expõe o
 * vínculo com o cache global do fornecedor. Banco real: o que a rota serializa é o que o repositório lê.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleMunicipalHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday.repository.js'
import { DrizzleMunicipalHolidayRuleRepository } from '../../src/business-calendar/infrastructure/drizzle-municipal-holiday-rule.repository.js'
import { DrizzleStateHolidayRepository } from '../../src/business-calendar/infrastructure/drizzle-state-holiday.repository.js'
import {
  toHolidayView,
  toSavedHolidayView,
} from '../../src/business-calendar/presentation/municipal-holiday.schema.js'
import { toStateHolidayView } from '../../src/business-calendar/presentation/state-holiday.schema.js'
import {
  actorOf,
  CAMPINAS,
  databaseUrl,
  SAO_PAULO,
  seedTenant,
  withBusinessCalendarDatabase,
} from '../fixtures/business-calendar-database.fixture.js'
import {
  seedImportedMunicipalHoliday,
  seedImportedStateHoliday,
} from '../fixtures/holiday-import-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const SAO_PAULO_STATE = '35'
const IMPORTED_DAY = '2026-11-20'
const TYPED_DAY = '2026-12-08'
const GENERATED_DAY = '2027-07-14'

describe('GET /municipal-holidays diz a origem de cada linha (spec 252, lacuna da T5.2)', () => {
  testWithPostgres(
    'importada é imported; digitada e gerada por regra são typed; o vínculo com o cache não vaza',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const rules = new DrizzleMunicipalHolidayRuleRepository(database.db)
        await rules.create({
          ...actorOf(tenant, 'seed-rule'),
          cityIbgeCode: CAMPINAS,
          currentYear: 2026,
          day: 14,
          kind: 'city_anniversary',
          month: 7,
          name: 'Aniversário de Campinas',
        })
        const imported = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: IMPORTED_DAY,
          ibgeCode: SAO_PAULO,
        })
        await holidays.save({
          ...actorOf(tenant, 'typed'),
          cityIbgeCode: SAO_PAULO,
          holidayOn: TYPED_DAY,
          name: 'Digitada',
        })

        const listed = (await holidays.list({ companyId: tenant.companyId })).map(toHolidayView)

        const byDay = new Map(listed.map((holiday) => [holiday.holidayOn, holiday]))
        expect(byDay.get(IMPORTED_DAY)).toMatchObject({ id: imported.id, origin: 'imported' })
        expect(byDay.get(TYPED_DAY)).toMatchObject({ generatedByRuleId: null, origin: 'typed' })
        const generated = byDay.get(GENERATED_DAY)
        expect(generated?.origin).toBe('typed')
        expect(generated?.generatedByRuleId).not.toBeNull()
        for (const holiday of listed) {
          expect(Object.keys(holiday).sort()).toEqual([
            'cityIbgeCode',
            'generatedByRuleId',
            'holidayOn',
            'id',
            'kind',
            'name',
            'origin',
          ])
        }
        expect(JSON.stringify(listed)).not.toContain(imported.providerEntryId ?? 'unreachable')
      })
    },
  )
})

describe('POST e PATCH de /municipal-holidays sobre a importada respondem typed (spec 252)', () => {
  testWithPostgres(
    'o POST que adota e o PATCH que adota devolvem typed, sem o vínculo com o cache',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const holidays = new DrizzleMunicipalHolidayRepository(database.db)
        const toAdoptByPost = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: IMPORTED_DAY,
          ibgeCode: SAO_PAULO,
        })
        const toAdoptByPatch = await seedImportedMunicipalHoliday(database, tenant, {
          holidayOn: TYPED_DAY,
          ibgeCode: SAO_PAULO,
        })

        const saved = await holidays.save({
          ...actorOf(tenant, 'adopt-post'),
          cityIbgeCode: SAO_PAULO,
          holidayOn: IMPORTED_DAY,
          name: 'Do operador',
        })
        const patched = await holidays.update({
          ...actorOf(tenant, 'adopt-patch'),
          changes: { name: 'Renomeada' },
          id: toAdoptByPatch.id,
        })

        const postView = toSavedHolidayView(saved)
        const patchView = toHolidayView(patched ?? failMissing())
        expect(postView).toMatchObject({ id: toAdoptByPost.id, origin: 'typed' })
        expect(patchView).toMatchObject({ id: toAdoptByPatch.id, origin: 'typed' })
        expect(JSON.stringify([postView, patchView])).not.toContain('provider')
        expect(JSON.stringify([postView, patchView])).not.toContain(
          toAdoptByPost.providerEntryId ?? 'unreachable',
        )
      })
    },
  )

  testWithPostgres('o POST de uma data nova e o PATCH de uma digitada seguem typed', async () => {
    await withBusinessCalendarDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const holidays = new DrizzleMunicipalHolidayRepository(database.db)

      const saved = await holidays.save({
        ...actorOf(tenant, 'fresh'),
        cityIbgeCode: SAO_PAULO,
        holidayOn: TYPED_DAY,
        name: 'Nova',
      })
      const patched = await holidays.update({
        ...actorOf(tenant, 'patch-typed'),
        changes: { name: 'Corrigida' },
        id: saved.holiday.id,
      })

      expect(toSavedHolidayView(saved).origin).toBe('typed')
      expect(toHolidayView(patched ?? failMissing()).origin).toBe('typed')
    })
  })
})

describe('/state-holidays diz a origem de cada linha (spec 252, lacuna da T5.2)', () => {
  testWithPostgres(
    'a lista: importada é imported, digitada (once e yearly) é typed, sem o vínculo com o cache',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        const imported = await seedImportedStateHoliday(database, tenant, {
          holidayOn: IMPORTED_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })
        await states.create({
          ...actorOf(tenant, 'once'),
          holidayOn: TYPED_DAY,
          name: 'Fixa',
          recurrence: 'once',
          stateIbgeCode: SAO_PAULO_STATE,
        })
        await states.create({
          ...actorOf(tenant, 'yearly'),
          day: 9,
          month: 7,
          name: 'Todo ano',
          recurrence: 'yearly',
          stateIbgeCode: SAO_PAULO_STATE,
        })

        const listed = (await states.list({ companyId: tenant.companyId })).map(toStateHolidayView)

        expect(listed).toHaveLength(3)
        expect(listed.map((holiday) => holiday.origin).sort()).toEqual([
          'imported',
          'typed',
          'typed',
        ])
        expect(listed.find((holiday) => holiday.id === imported.id)?.origin).toBe('imported')
        for (const holiday of listed) {
          expect(Object.keys(holiday)).toContain('origin')
          expect(Object.keys(holiday)).not.toContain('providerEntryId')
        }
        expect(JSON.stringify(listed)).not.toContain(imported.providerEntryId ?? 'unreachable')
      })
    },
  )

  testWithPostgres(
    'o POST que adota e o PATCH que adota devolvem typed; o POST novo e o PATCH digitado também',
    async () => {
      await withBusinessCalendarDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const states = new DrizzleStateHolidayRepository(database.db)
        await seedImportedStateHoliday(database, tenant, {
          holidayOn: IMPORTED_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })
        const toPatch = await seedImportedStateHoliday(database, tenant, {
          holidayOn: TYPED_DAY,
          ibgeCode: SAO_PAULO_STATE,
        })

        const adoptedByPost = await states.create({
          ...actorOf(tenant, 'adopt-post'),
          holidayOn: IMPORTED_DAY,
          name: 'Do operador',
          recurrence: 'once',
          stateIbgeCode: SAO_PAULO_STATE,
        })
        const adoptedByPatch = await states.update({
          ...actorOf(tenant, 'adopt-patch'),
          changes: { name: 'Renomeado', recurrence: 'once' },
          id: toPatch.id,
        })
        const fresh = await states.create({
          ...actorOf(tenant, 'fresh'),
          holidayOn: '2026-12-25',
          name: 'Novo',
          recurrence: 'once',
          stateIbgeCode: SAO_PAULO_STATE,
        })
        const patchedTyped = await states.update({
          ...actorOf(tenant, 'patch-typed'),
          changes: { name: 'Corrigido', recurrence: 'once' },
          id: fresh.holiday.id,
        })

        for (const record of [
          adoptedByPost.holiday,
          adoptedByPatch ?? failMissing(),
          fresh.holiday,
          patchedTyped ?? failMissing(),
        ]) {
          expect(toStateHolidayView(record).origin).toBe('typed')
        }
      })
    },
  )
})

function failMissing(): never {
  throw new Error('the holiday should exist')
}
