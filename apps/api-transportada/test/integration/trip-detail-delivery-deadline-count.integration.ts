/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2d (CA5), contra Postgres real, no molde de `trip-detail-query-count`: o prazo de entrega
 * não multiplica consultas. Sem chegada o detalhe custa o mesmo de antes (+0); com candidata custa
 * exatamente seis a mais (desvio, entrega e as quatro do calendário), seja uma nota ou duzentas, uma
 * cidade ou quarenta. Conta `select` e `selectDistinctOn`.
 */
import { describe, expect, test } from 'bun:test'

import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ARRIVED_TUESDAY,
  seedArrival,
  seedNotes,
  seedTripWithNotes,
  WEDNESDAY_NOON,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const EXTRA_QUERIES_WITH_CANDIDATE = 6
const EXTRA_QUERIES_WITHOUT_CITY = 2
const LARGE_NOTE_COUNT = 200
const LARGE_CITY_COUNT = 40
const FIRST_FAKE_CITY = 3500000

function countingDatabase(db: TestDatabase['db']): {
  readonly database: TestDatabase['db']
  readonly queryCount: () => number
} {
  let count = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'select' || property === 'selectDistinctOn') count += 1
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  return { database, queryCount: () => count }
}

/** Quantas consultas o `findById` faz — com o prazo ligado (relógio injetado) ou como era antes. */
async function measure(
  database: TestDatabase,
  params: { readonly isDeadlineOn: boolean; readonly tripId: string },
): Promise<number> {
  const counted = countingDatabase(database.db)
  const repository = new DrizzleTripRepository(
    counted.database,
    undefined,
    params.isDeadlineOn ? { clock: { now: () => WEDNESDAY_NOON } } : {},
  )
  await repository.findById({ companyId: COMPANY_ID, tripId: params.tripId })
  return counted.queryCount()
}

async function seedTrip(
  database: TestDatabase,
  params: {
    readonly cityCodes: readonly string[]
    readonly hasArrival: boolean
    readonly noteCount: number
    readonly tenants: CargoTenants
  },
): Promise<string> {
  const documentIds = await seedNotes(database, {
    cityCodes: params.cityCodes,
    companyId: COMPANY_ID,
    count: params.noteCount,
    emitterTaxId: ISSUER_TAX_ID,
  })
  const trip = await seedTripWithNotes(database, { companyId: COMPANY_ID, documentIds })
  if (!params.hasArrival) return trip.tripId
  await seedArrival(database, {
    arrivedAt: ARRIVED_TUESDAY,
    companyId: COMPANY_ID,
    contractorId: params.tenants.contractorId,
    deadlineBusinessDays: 3,
    documentIds,
  })
  return trip.tripId
}

async function extraQueries(database: TestDatabase, tripId: string): Promise<number> {
  const without = await measure(database, { isDeadlineOn: false, tripId })
  const withDeadline = await measure(database, { isDeadlineOn: true, tripId })
  return withDeadline - without
}

describe('o prazo de entrega não multiplica consultas (spec 236 T1.2d, CA5)', () => {
  testWithPostgres(
    'viagem sem nenhuma chegada: a mesma contagem de antes (+0)',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const tripId = await seedTrip(database, {
          cityCodes: ['3548906'],
          hasArrival: false,
          noteCount: 3,
          tenants,
        })

        expect(await extraQueries(database, tripId)).toBe(0)
      })
    },
    60_000,
  )

  testWithPostgres(
    'com candidata: exatamente seis a mais, com 1 nota ou 200, 1 cidade ou 40',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const smallTripId = await seedTrip(database, {
          cityCodes: ['3548906'],
          hasArrival: true,
          noteCount: 1,
          tenants,
        })
        const largeTripId = await seedTrip(database, {
          cityCodes: Array.from({ length: LARGE_CITY_COUNT }, (_, index) =>
            String(FIRST_FAKE_CITY + index),
          ),
          hasArrival: true,
          noteCount: LARGE_NOTE_COUNT,
          tenants,
        })

        const small = await extraQueries(database, smallTripId)
        const large = await extraQueries(database, largeTripId)
        const smallTotal = await measure(database, { isDeadlineOn: true, tripId: smallTripId })
        const largeTotal = await measure(database, { isDeadlineOn: true, tripId: largeTripId })

        expect(small).toBe(EXTRA_QUERIES_WITH_CANDIDATE)
        expect(large).toBe(EXTRA_QUERIES_WITH_CANDIDATE)
        expect(largeTotal).toBe(smallTotal)
      })
    },
    120_000,
  )

  testWithPostgres(
    'candidata sem cidade de destino: só o desvio e a entrega, sem calendário (+2)',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const tripId = await seedTrip(database, {
          cityCodes: ['0000000'],
          hasArrival: true,
          noteCount: 2,
          tenants,
        })

        expect(await extraQueries(database, tripId)).toBe(EXTRA_QUERIES_WITHOUT_CITY)
      })
    },
    60_000,
  )
})
