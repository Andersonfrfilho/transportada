/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (D12), contra Postgres real: a contagem de consultas da leitura do motorista
 * (`GET /me/trips/current`, o caso de uso inteiro: vínculo, viagens, fotos pendentes e nota) é FIXA —
 * não depende de quantas paradas, notas ou cidades a viagem tem. É a linha de base sobre a qual o aviso
 * de feriado soma +5 (ver `driver-current-trip-holiday-warnings.integration.ts`).
 */
import { describe, expect, test } from 'bun:test'

import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  seedDriverAccount,
  seedDriverTrip,
  type SeededDriverAccount,
} from '../fixtures/driver-holiday-warning-seed.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const NOW = new Date('2026-10-21T15:00:00.000Z')
const ETA = new Date('2026-10-21T15:00:00.000Z')
/** Medido em 2026-10-09 sobre `origin/staging` (`e770d57ce`): vínculo, viagens, fotos pendentes e nota. */
const DRIVER_READ_BASELINE_QUERIES = 25

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

async function measureRead(database: TestDatabase, driver: SeededDriverAccount): Promise<number> {
  const counted = countingDatabase(database.db)
  const result = await findCurrentDriverTrip({
    companyId: COMPANY_ID,
    membershipId: driver.membershipId,
    now: NOW,
    repository: new DrizzleCurrentDriverTripRepository(counted.database),
    scores: new DrizzleDriverScoreRepository(counted.database),
  })
  expect(result.trips).toHaveLength(1)
  return counted.queryCount()
}

function stopsIn(cityCount: number, noteCount: number) {
  return Array.from({ length: cityCount }, (_unused, index) => ({
    cityCode: String(3500000 + index),
    estimatedArrivalAt: ETA,
    noteCount,
  }))
}

describe('a leitura do motorista tem custo fixo (spec 252 T4.3, linha de base)', () => {
  testWithPostgres(
    'a contagem de consultas é a mesma com 1 parada e com 30 paradas em 30 cidades com várias notas',
    async () => {
      await withCargoDatabase(async (database) => {
        const small = await seedDriverAccount(database, COMPANY_ID)
        const large = await seedDriverAccount(database, COMPANY_ID)
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: small,
          stops: stopsIn(1, 1),
        })
        await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver: large,
          stops: stopsIn(30, 3),
        })

        const smallCount = await measureRead(database, small)
        const largeCount = await measureRead(database, large)

        expect(largeCount).toBe(smallCount)
        expect(smallCount).toBe(DRIVER_READ_BASELINE_QUERIES)
      })
    },
    180_000,
  )
})
