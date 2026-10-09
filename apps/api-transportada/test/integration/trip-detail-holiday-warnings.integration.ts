/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6, CA12): o detalhe da viagem avisa, na parada, quando a entrega prevista cai em
 * feriado da cidade dela — a data é o dia civil de São Paulo da ETA, a cidade é o 1º segmento do `address_key`,
 * o nome vem do endereço da nota (e some quando a cidade não é a da parada). O campo é aditivo, só existe
 * com o relógio injetado, não mexe no prazo da 236 e custa +0 ou +4 consultas, em série.
 */
import { describe, expect, test } from 'bun:test'

import { municipalHolidayRules, tripStops } from '../../src/database/database.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { seedImportedMunicipalHoliday } from '../fixtures/holiday-import-database.fixture.js'
import {
  ARRIVED_TUESDAY,
  CAMPINAS,
  seedArrival,
  seedTypedHoliday,
  WEDNESDAY_NOON,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'
import { seedTripWithStops } from '../fixtures/trip-holiday-warning-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const USER_ID = COMPANY_CONTEXT.userId
const SAO_CARLOS = '3548906'
const SANTOS = '3548500'
const WEDNESDAY_21 = new Date('2026-10-21T15:00:00.000Z')
/** 22/10 às 22h30 em São Paulo: já é dia 23 em UTC. */
const NIGHT_OF_22_IN_SAO_PAULO = new Date('2026-10-23T01:30:00.000Z')
const EXTRA_QUERIES = 4
/** Desvio, entrega e as quatro do calendário (spec 236): o aviso reaproveita as quatro. */
const DEADLINE_EXTRA_QUERIES = 6

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

async function measure(
  database: TestDatabase,
  params: { readonly isClockOn: boolean; readonly tripId: string },
): Promise<number> {
  const counted = countingDatabase(database.db)
  const repository = new DrizzleTripRepository(
    counted.database,
    undefined,
    params.isClockOn ? { clock: { now: () => WEDNESDAY_NOON } } : {},
  )
  await repository.findById({ companyId: COMPANY_ID, tripId: params.tripId })
  return counted.queryCount()
}

async function extraQueries(database: TestDatabase, tripId: string): Promise<number> {
  const without = await measure(database, { isClockOn: false, tripId })
  const withClock = await measure(database, { isClockOn: true, tripId })
  return withClock - without
}

async function readDetail(database: TestDatabase, tripId: string) {
  const repository = new DrizzleTripRepository(database.db, undefined, {
    clock: { now: () => WEDNESDAY_NOON },
  })
  const detail = await repository.findById({ companyId: COMPANY_ID, tripId })
  if (detail === null) throw new Error('EXPECTED_TRIP')
  return detail
}

describe('o aviso de feriado por parada no detalhe da viagem (spec 252 T4.2)', () => {
  testWithPostgres(
    'avisa só a parada da cidade em feriado, na data da ETA em São Paulo, com a origem e o nome',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        await seedImportedMunicipalHoliday(
          database,
          { companyId: COMPANY_ID, userId: USER_ID },
          { holidayOn: '2026-10-22', ibgeCode: CAMPINAS, name: 'Importado de Campinas' },
        )
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [
            { cityCode: CAMPINAS, cityName: 'Campinas', estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: SAO_CARLOS, cityName: 'São Carlos', estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: CAMPINAS, completedAt: WEDNESDAY_NOON, estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
            { cityCode: CAMPINAS, estimatedArrivalAt: NIGHT_OF_22_IN_SAO_PAULO },
          ],
        })

        const detail = await readDetail(database, seeded.tripId)

        const [typed, other, completed, withoutEta, imported] = detail.stops
        expect(typed?.holidayWarnings).toEqual([
          {
            cityIbgeCode: 3509502,
            cityName: 'Campinas',
            date: '2026-10-21',
            reasons: [{ name: 'Feriado digitado', origin: 'typed', scope: 'municipal' }],
          },
        ])
        expect(other).toBeDefined()
        for (const stop of [other, completed, withoutEta]) {
          expect(stop !== undefined && 'holidayWarnings' in stop).toBe(false)
        }
        expect(imported?.holidayWarnings).toEqual([
          expect.objectContaining({
            date: '2026-10-22',
            reasons: [{ name: 'Importado de Campinas', origin: 'imported', scope: 'municipal' }],
          }),
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'com o endereço da nota em outra cidade (desvio), o aviso fica e o nome da cidade some',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [
            {
              addressKeyCityCode: CAMPINAS,
              cityCode: SAO_CARLOS,
              cityName: 'São Carlos',
              estimatedArrivalAt: WEDNESDAY_21,
            },
          ],
        })

        const [stop] = (await readDetail(database, seeded.tripId)).stops

        const warning = stop?.holidayWarnings?.[0]
        expect(stop?.holidayWarnings).toHaveLength(1)
        expect(warning).toMatchObject({ cityIbgeCode: 3509502, date: '2026-10-21' })
        expect(warning !== undefined && 'cityName' in warning).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres('o feriado da outra empresa não avisa a parada (BOLA)', async () => {
    await withCargoDatabase(async (database, tenants) => {
      await seedTypedHoliday(database, {
        cityIbgeCode: CAMPINAS,
        companyId: tenants.foreignCompanyId,
        holidayOn: '2026-10-21',
      })
      const seeded = await seedTripWithStops(database, {
        companyId: COMPANY_ID,
        stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
      })

      const [stop] = (await readDetail(database, seeded.tripId)).stops

      expect(stop !== undefined && 'holidayWarnings' in stop).toBe(false)
    })
  })

  testWithPostgres('a regra "todo ano" avisa com a origem "regra"', async () => {
    await withCargoDatabase(async (database) => {
      await database.db.insert(municipalHolidayRules).values({
        cityIbgeCode: SANTOS,
        companyId: COMPANY_ID,
        day: 21,
        kind: 'city_anniversary',
        materializedThroughYear: 2036,
        month: 10,
        name: 'Aniversário de Santos',
      })
      const seeded = await seedTripWithStops(database, {
        companyId: COMPANY_ID,
        stops: [{ cityCode: SANTOS, estimatedArrivalAt: WEDNESDAY_21 }],
      })

      const [stop] = (await readDetail(database, seeded.tripId)).stops

      expect(stop?.holidayWarnings?.[0]?.reasons).toEqual([
        { name: 'Aniversário de Santos', origin: 'rule', scope: 'municipal' },
      ])
    })
  })
})

describe('o aviso não mexe no prazo da 236 nem existe sem o relógio (spec 252 T4.2)', () => {
  testWithPostgres('as notas da viagem são as mesmas com e sem aviso na parada', async () => {
    await withCargoDatabase(async (database, tenants) => {
      await seedTypedHoliday(database, {
        cityIbgeCode: CAMPINAS,
        companyId: COMPANY_ID,
        holidayOn: '2026-10-21',
      })
      const seeded = await seedTripWithStops(database, {
        companyId: COMPANY_ID,
        stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
      })
      await seedArrival(database, {
        arrivedAt: ARRIVED_TUESDAY,
        companyId: COMPANY_ID,
        contractorId: tenants.contractorId,
        deadlineBusinessDays: 3,
        documentIds: seeded.documentIds.flat(),
      })

      const withWarning = await readDetail(database, seeded.tripId)
      await database.db.update(tripStops).set({ estimatedArrivalAt: null })
      const withoutWarning = await readDetail(database, seeded.tripId)

      expect(withWarning.stops[0]?.holidayWarnings).toHaveLength(1)
      expect('holidayWarnings' in (withoutWarning.stops[0] ?? {})).toBe(false)
      expect(withWarning.documents).toEqual(withoutWarning.documents)
      expect(withWarning.documents[0]?.deliveryDeadline).not.toBeNull()
    })
  })

  testWithPostgres(
    'sem o relógio injetado o campo não é calculado e nada é consultado',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
        })
        const repository = new DrizzleTripRepository(database.db)

        const detail = await repository.findById({ companyId: COMPANY_ID, tripId: seeded.tripId })

        expect('holidayWarnings' in (detail?.stops[0] ?? {})).toBe(false)
      })
    },
  )
})

describe('o aviso não multiplica consultas (spec 252 T4.2, CA12)', () => {
  async function seedManyStops(database: TestDatabase, cityCount: number): Promise<string> {
    const seeded = await seedTripWithStops(database, {
      companyId: COMPANY_ID,
      stops: Array.from({ length: cityCount }, (_unused, index) => ({
        cityCode: String(3500000 + index),
        estimatedArrivalAt: WEDNESDAY_21,
      })),
    })
    return seeded.tripId
  }

  testWithPostgres(
    'sem calendário carregado: exatamente +4, com 1 parada ou 40 paradas em 40 cidades',
    async () => {
      await withCargoDatabase(async (database) => {
        const small = await seedManyStops(database, 1)
        const large = await seedManyStops(database, 40)

        expect(await extraQueries(database, small)).toBe(EXTRA_QUERIES)
        expect(await extraQueries(database, large)).toBe(EXTRA_QUERIES)
        const smallTotal = await measure(database, { isClockOn: true, tripId: small })
        const largeTotal = await measure(database, { isClockOn: true, tripId: large })
        expect(largeTotal).toBe(smallTotal)
      })
    },
    120_000,
  )

  testWithPostgres(
    'sem parada que avise (sem ETA ou concluída): +0',
    async () => {
      await withCargoDatabase(async (database) => {
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
            { cityCode: CAMPINAS, completedAt: WEDNESDAY_NOON, estimatedArrivalAt: WEDNESDAY_21 },
          ],
        })

        expect(await extraQueries(database, seeded.tripId)).toBe(0)
      })
    },
    60_000,
  )

  testWithPostgres(
    'com o calendário que o prazo da 236 já carregou: o aviso não paga nada (+6 no total, nunca +10)',
    async () => {
      await withCargoDatabase(async (database, tenants: CargoTenants) => {
        const seeded = await seedTripWithStops(database, {
          companyId: COMPANY_ID,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
        })
        await seedArrival(database, {
          arrivedAt: ARRIVED_TUESDAY,
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: 3,
          documentIds: seeded.documentIds.flat(),
        })

        expect(await extraQueries(database, seeded.tripId)).toBe(DEADLINE_EXTRA_QUERIES)
      })
    },
    60_000,
  )
})
