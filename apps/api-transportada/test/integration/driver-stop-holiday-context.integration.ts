/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3, contra Postgres real: a leitura do contexto das paradas do aviso do motorista — só as
 * paradas pedidas, só as da empresa, só as que têm ETA, com o endereço da nota que ainda está na viagem
 * (nota liberada não conta) e UMA consulta, com 1 ou 30 paradas.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripDocuments } from '../../src/database/database.schema.js'
import { DrizzleDriverStopHolidayContextRepository } from '../../src/trips/infrastructure/drizzle-driver-stop-holiday-context.repository.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { CAMPINAS } from '../fixtures/trip-delivery-deadline-seed.fixture.js'
import { seedTripWithStops } from '../fixtures/trip-holiday-warning-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const SAO_CARLOS = '3548906'
const ETA = new Date('2026-10-21T15:00:00.000Z')

function countingDatabase(db: TestDatabase['db']) {
  let count = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'select' || property === 'selectDistinctOn' || property === 'execute')
        count += 1
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  return { database, queryCount: () => count }
}

describe('o contexto das paradas do aviso do motorista (spec 252 T4.3)', () => {
  testWithPostgres(
    'devolve só as paradas pedidas e da empresa (com ou sem ETA) — e o endereço de destino da nota',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const own = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [
            { cityCode: CAMPINAS, cityName: 'Campinas', estimatedArrivalAt: ETA },
            { cityCode: SAO_CARLOS, cityName: 'São Carlos', estimatedArrivalAt: ETA },
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
          ],
        })
        const foreign = await seedTripWithStops(database, {
          companyId: tenants.foreignCompanyId,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: ETA }],
        })
        const repository = new DrizzleDriverStopHolidayContextRepository(database.db)
        const [first, second, withoutEta] = own.stopIds as [string, string, string]

        const contexts = await repository.list({
          companyId: COMPANY_ID,
          stopIds: [first, withoutEta, foreign.stopIds[0] ?? ''],
        })

        expect(contexts.map((context) => context.stopId).toSorted()).toEqual(
          [first, withoutEta].toSorted(),
        )
        const withEta = contexts.find((context) => context.stopId === first)
        expect(withEta).toMatchObject({
          address: { city: 'Campinas', cityCode: CAMPINAS },
          estimatedArrivalAt: ETA,
        })
        expect(withEta?.addressKey.startsWith(`${CAMPINAS}|`)).toBe(true)
        expect(contexts.find((context) => context.stopId === withoutEta)?.estimatedArrivalAt).toBe(
          null,
        )
        expect(contexts.map((context) => context.stopId)).not.toContain(second)
        expect(await repository.list({ companyId: COMPANY_ID, stopIds: [] })).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'a nota liberada da viagem não dá o endereço; sem nota viva a parada sai sem endereço',
    async () => {
      await withCargoDatabase(async (database) => {
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [{ cityCode: CAMPINAS, cityName: 'Campinas', estimatedArrivalAt: ETA }],
        })
        await database.db
          .update(tripDocuments)
          .set({ releasedAt: new Date('2026-10-21T10:00:00.000Z') })
          .where(eq(tripDocuments.tripId, seeded.tripId))
        const repository = new DrizzleDriverStopHolidayContextRepository(database.db)

        const [context] = await repository.list({
          companyId: COMPANY_ID,
          stopIds: seeded.stopIds,
        })

        expect(context?.stopId).toBe(seeded.stopIds[0])
        expect(context?.address).toBeUndefined()
      })
    },
    60_000,
  )

  testWithPostgres(
    'uma consulta para qualquer número de paradas',
    async () => {
      await withCargoDatabase(async (database) => {
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: Array.from({ length: 12 }, (_unused, index) => ({
            cityCode: String(3500000 + index),
            estimatedArrivalAt: ETA,
            noteCount: 2,
          })),
        })
        const one = countingDatabase(database.db)
        const many = countingDatabase(database.db)

        await new DrizzleDriverStopHolidayContextRepository(one.database).list({
          companyId: COMPANY_ID,
          stopIds: seeded.stopIds.slice(0, 1),
        })
        const contexts = await new DrizzleDriverStopHolidayContextRepository(many.database).list({
          companyId: COMPANY_ID,
          stopIds: seeded.stopIds,
        })

        expect(contexts).toHaveLength(12)
        expect(one.queryCount()).toBe(1)
        expect(many.queryCount()).toBe(1)
      })
    },
    60_000,
  )
})
