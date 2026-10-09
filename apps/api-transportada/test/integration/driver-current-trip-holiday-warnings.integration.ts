/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12, CA15), contra Postgres real: a leitura do motorista (`GET /me/trips/current`)
 * avisa, na parada, quando a entrega cai em feriado da cidade dela. A data é o dia civil de São Paulo da ETA —
 * ou HOJE, com a parada em andamento; parada concluída não avisa; o recorte pelo vínculo do motorista segue
 * (o motorista de outra viagem não recebe o aviso dela); o formato é o que o app do motorista valida; e a
 * leitura custa +5 consultas fixas, ou nada, sem derrubar o snapshot quando o calendário falha.
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleHolidayWarningRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-warning.repository.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import type { DriverHolidayWarningsDependency } from '../../src/trips/application/driver-stop-holiday-warning.port.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverStopHolidayContextRepository } from '../../src/trips/infrastructure/drizzle-driver-stop-holiday-context.repository.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  markStopInProgress,
  seedDriverAccount,
  seedDriverTrip,
  type SeededDriverAccount,
} from '../fixtures/driver-holiday-warning-seed.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { seedImportedMunicipalHoliday } from '../fixtures/holiday-import-database.fixture.js'
import { CAMPINAS, seedTypedHoliday } from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const USER_ID = COMPANY_CONTEXT.userId
const SAO_CARLOS = '3548906'
const NOW = new Date('2026-10-21T13:00:00.000Z')
const WEDNESDAY_21 = new Date('2026-10-21T15:00:00.000Z')
const TUESDAY_20 = new Date('2026-10-20T15:00:00.000Z')
/** 22/10 às 22h30 em São Paulo: já é dia 23 em UTC. */
const NIGHT_OF_22_IN_SAO_PAULO = new Date('2026-10-23T01:30:00.000Z')
const BASELINE_QUERIES = 25
const WARNING_EXTRA_QUERIES = 5
const CONTEXT_ONLY_EXTRA_QUERIES = 1

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

function failingLogger(): { readonly logger: ApiLogger; readonly warnings: unknown[] } {
  const warnings: unknown[] = []
  const logger: ApiLogger = {
    error: () => undefined,
    info: () => undefined,
    warn: (message, metadata) => {
      warnings.push({ message, metadata })
    },
  }
  return { logger, warnings }
}

function dependencyOn(db: TestDatabase['db'], logger?: ApiLogger): DriverHolidayWarningsDependency {
  return {
    calendar: new DrizzleHolidayWarningRepository(db),
    contexts: new DrizzleDriverStopHolidayContextRepository(db),
    ...(logger === undefined ? {} : { logger }),
  }
}

type ReadOptions = {
  readonly dependency?: (db: TestDatabase['db']) => DriverHolidayWarningsDependency
  readonly now?: Date
}

async function readAs(database: TestDatabase, driver: SeededDriverAccount, options: ReadOptions) {
  const counted = countingDatabase(database.db)
  const result = await findCurrentDriverTrip({
    companyId: COMPANY_ID,
    membershipId: driver.membershipId,
    now: options.now ?? NOW,
    repository: new DrizzleCurrentDriverTripRepository(counted.database),
    scores: new DrizzleDriverScoreRepository(counted.database),
    ...(options.dependency === undefined
      ? {}
      : { holidayWarnings: options.dependency(counted.database) }),
  })
  return { queryCount: counted.queryCount(), result }
}

/** O que o app do motorista recebe: o JSON da resposta, parada a parada. */
async function readStopsAsJson(database: TestDatabase, driver: SeededDriverAccount, options = {}) {
  const { result } = await readAs(database, driver, { dependency: dependencyOn, ...options })
  const [trip] = JSON.parse(JSON.stringify(result.trips)) as readonly {
    readonly stops: readonly Record<string, unknown>[]
  }[]
  return trip?.stops ?? []
}

describe('o aviso de feriado nas paradas de GET /me/trips/current (spec 252 T4.3)', () => {
  testWithPostgres(
    'avisa só a parada aberta, com ETA, da cidade em feriado — com a origem, o nome e o formato do app',
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
        const driver = await seedDriverAccount(database, COMPANY_ID)
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [
            { cityCode: CAMPINAS, cityName: 'Campinas', estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: SAO_CARLOS, cityName: 'São Carlos', estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: CAMPINAS, completedAt: TUESDAY_20, estimatedArrivalAt: WEDNESDAY_21 },
            { cityCode: CAMPINAS, estimatedArrivalAt: null },
            {
              cityCode: CAMPINAS,
              cityName: 'Campinas',
              estimatedArrivalAt: NIGHT_OF_22_IN_SAO_PAULO,
            },
          ],
        })

        const stops = await readStopsAsJson(database, driver)

        expect(stops.map((stop) => stop.holidayWarnings)).toEqual([
          [
            {
              cityIbgeCode: 3509502,
              cityName: 'Campinas',
              date: '2026-10-21',
              reasons: [{ name: 'Feriado digitado', origin: 'typed', scope: 'municipal' }],
            },
          ],
          undefined,
          undefined,
          undefined,
          [
            {
              cityIbgeCode: 3509502,
              cityName: 'Campinas',
              date: '2026-10-22',
              reasons: [{ name: 'Importado de Campinas', origin: 'imported', scope: 'municipal' }],
            },
          ],
        ])
        for (const index of [1, 2, 3]) expect('holidayWarnings' in (stops[index] ?? {})).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'com a parada em andamento (chegou, ou a caminho) o dia é hoje em São Paulo, não o da ETA',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const driver = await seedDriverAccount(database, COMPANY_ID)
        const seeded = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [
            { cityCode: CAMPINAS, estimatedArrivalAt: TUESDAY_20 },
            { cityCode: CAMPINAS, estimatedArrivalAt: TUESDAY_20 },
            { cityCode: CAMPINAS, estimatedArrivalAt: TUESDAY_20 },
          ],
        })
        const [arrivedStop, enRouteStop] = seeded.stopIds as [string, string, string]
        await markStopInProgress(database, { at: NOW, kind: 'arrived', stopId: arrivedStop })
        await markStopInProgress(database, { at: NOW, kind: 'en_route', stopId: enRouteStop })

        const stops = await readStopsAsJson(database, driver)

        const dates = stops.map(
          (stop) =>
            (stop.holidayWarnings as readonly { readonly date: string }[] | undefined)?.[0]?.date,
        )
        expect(dates).toEqual(['2026-10-21', '2026-10-21', undefined])
      })
    },
    60_000,
  )

  testWithPostgres(
    'hoje é o dia civil de São Paulo: às 22h30 do dia 22 o dia ainda é 22, mesmo já sendo 23 em UTC',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedImportedMunicipalHoliday(
          database,
          { companyId: COMPANY_ID, userId: USER_ID },
          { holidayOn: '2026-10-22', ibgeCode: CAMPINAS, name: 'Importado de Campinas' },
        )
        const driver = await seedDriverAccount(database, COMPANY_ID)
        const seeded = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: TUESDAY_20 }],
        })
        await markStopInProgress(database, {
          at: NIGHT_OF_22_IN_SAO_PAULO,
          kind: 'arrived',
          stopId: seeded.stopIds[0] ?? '',
        })

        const stops = await readStopsAsJson(database, driver, { now: NIGHT_OF_22_IN_SAO_PAULO })

        expect(stops[0]?.holidayWarnings).toEqual([expect.objectContaining({ date: '2026-10-22' })])
      })
    },
    60_000,
  )

  testWithPostgres(
    'com o endereço da nota em outra cidade (desvio) o aviso fica e o nome da cidade some',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const driver = await seedDriverAccount(database, COMPANY_ID)
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [
            {
              addressKeyCityCode: CAMPINAS,
              cityCode: SAO_CARLOS,
              cityName: 'São Carlos',
              estimatedArrivalAt: WEDNESDAY_21,
            },
          ],
        })

        const [stop] = await readStopsAsJson(database, driver)

        const warnings = stop?.holidayWarnings as readonly Record<string, unknown>[]
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toMatchObject({ cityIbgeCode: 3509502, date: '2026-10-21' })
        expect('cityName' in (warnings[0] ?? {})).toBe(false)
      })
    },
    60_000,
  )
})

describe('o aviso do motorista respeita o recorte dele e o da empresa (spec 252 T4.3, BOLA)', () => {
  testWithPostgres(
    'o motorista de outra viagem não recebe o aviso dela, nem um id dela na resposta',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const driverA = await seedDriverAccount(database, COMPANY_ID)
        const driverB = await seedDriverAccount(database, COMPANY_ID)
        const tripA = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: driverA,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
        })
        const tripB = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: driverB,
          stops: [{ cityCode: SAO_CARLOS, estimatedArrivalAt: WEDNESDAY_21 }],
        })

        const asA = await readAs(database, driverA, { dependency: dependencyOn })
        const asB = await readAs(database, driverB, { dependency: dependencyOn })

        expect(asA.result.trips.map((trip) => trip.id)).toEqual([tripA.tripId])
        expect(asA.result.trips[0]?.stops[0]?.holidayWarnings).toHaveLength(1)
        expect(asB.result.trips.map((trip) => trip.id)).toEqual([tripB.tripId])
        expect('holidayWarnings' in (asB.result.trips[0]?.stops[0] ?? {})).toBe(false)
        const bodyOfB = JSON.stringify(asB.result)
        expect(bodyOfB).not.toContain(tripA.tripId)
        expect(bodyOfB).not.toContain(tripA.stopIds[0] ?? 'missing')
      })
    },
    60_000,
  )

  testWithPostgres('o feriado da outra empresa não avisa a parada', async () => {
    await withCargoDatabase(async (database, tenants) => {
      await seedTypedHoliday(database, {
        cityIbgeCode: CAMPINAS,
        companyId: tenants.foreignCompanyId,
        holidayOn: '2026-10-21',
      })
      const driver = await seedDriverAccount(database, COMPANY_ID)
      await seedDriverTrip(database, {
        companyId: COMPANY_ID,
        driver,
        stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
      })

      const [stop] = await readStopsAsJson(database, driver)

      expect('holidayWarnings' in (stop ?? {})).toBe(false)
    })
  })
})

describe('o aviso do motorista custa +5 consultas fixas (spec 252 T4.3, CA15)', () => {
  async function extraQueries(database: TestDatabase, driver: SeededDriverAccount) {
    const without = await readAs(database, driver, {})
    const withWarnings = await readAs(database, driver, { dependency: dependencyOn })
    return { baseline: without.queryCount, extra: withWarnings.queryCount - without.queryCount }
  }

  testWithPostgres(
    'exatamente +5 com 1 parada, e os mesmos +5 com 30 paradas em 30 cidades',
    async () => {
      await withCargoDatabase(async (database) => {
        const small = await seedDriverAccount(database, COMPANY_ID)
        const large = await seedDriverAccount(database, COMPANY_ID)
        const stopsIn = (cityCount: number) =>
          Array.from({ length: cityCount }, (_unused, index) => ({
            cityCode: String(3500000 + index),
            estimatedArrivalAt: WEDNESDAY_21,
          }))
        await seedDriverTrip(database, { companyId: COMPANY_ID, driver: small, stops: stopsIn(1) })
        await seedDriverTrip(database, { companyId: COMPANY_ID, driver: large, stops: stopsIn(30) })

        const smallCost = await extraQueries(database, small)
        const largeCost = await extraQueries(database, large)

        expect(smallCost).toEqual({ baseline: BASELINE_QUERIES, extra: WARNING_EXTRA_QUERIES })
        expect(largeCost).toEqual({ baseline: BASELINE_QUERIES, extra: WARNING_EXTRA_QUERIES })
      })
    },
    180_000,
  )

  testWithPostgres(
    'sem parada aberta: +0; aberta mas sem ETA: só a consulta do contexto (+1)',
    async () => {
      await withCargoDatabase(async (database) => {
        const closed = await seedDriverAccount(database, COMPANY_ID)
        const withoutEta = await seedDriverAccount(database, COMPANY_ID)
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: closed,
          stops: [
            { cityCode: CAMPINAS, completedAt: TUESDAY_20, estimatedArrivalAt: WEDNESDAY_21 },
          ],
        })
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: withoutEta,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: null }],
        })

        expect((await extraQueries(database, closed)).extra).toBe(0)
        expect((await extraQueries(database, withoutEta)).extra).toBe(CONTEXT_ONLY_EXTRA_QUERIES)
      })
    },
    60_000,
  )
})

describe('a falha do aviso não derruba o snapshot do motorista (spec 252 T4.3)', () => {
  testWithPostgres(
    'o calendário que falha tira o aviso, deixa rastro só com ids e contagem, e a viagem sai igual',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-21',
        })
        const driver = await seedDriverAccount(database, COMPANY_ID)
        const seeded = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [{ cityCode: CAMPINAS, estimatedArrivalAt: WEDNESDAY_21 }],
        })
        const { logger, warnings } = failingLogger()
        const brokenCalendar = {
          select: () => {
            throw new Error('boom: Campinas 12345678901')
          },
        }
        const without = await readAs(database, driver, {})

        const failed = await readAs(database, driver, {
          dependency: (db) => ({
            calendar: new DrizzleHolidayWarningRepository(brokenCalendar as never),
            contexts: new DrizzleDriverStopHolidayContextRepository(db),
            logger,
          }),
        })

        expect(failed.result).toEqual(without.result)
        expect(warnings).toEqual([
          {
            message: 'driver_holiday_warning_unavailable',
            metadata: {
              affectedStopCount: 1,
              companyId: COMPANY_ID,
              tripIds: [seeded.tripId],
            },
          },
        ])
        expect(JSON.stringify(warnings)).not.toContain('boom')
      })
    },
    60_000,
  )
})
