/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2d (CA2), contra Postgres real: a nota marcada "devolver ao contratante" na chegada (spec
 * 237 RF8a) fica sem prazo, e a irmã dela na mesma chegada segue com o dela.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../src/database/database.schema.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ARRIVED_AT,
  hasTestDatabase,
  seedDamaged,
} from '../fixtures/cargo-arrival-damaged.fixture.js'
import { withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import {
  readDeadlines,
  seedTripWithNotes,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const ONE_HOUR_MS = 3_600_000

describe('a nota a devolver ao contratante não tem prazo (spec 236 T1.2d)', () => {
  testWithPostgres(
    'marcada na chegada: null; a outra nota da mesma chegada mantém o prazo',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const trip = await seedTripWithNotes(database, {
          companyId: COMPANY_ID,
          documentIds: damaged.documentIds,
        })
        await database.db
          .update(cargoArrivalDocuments)
          .set({ returnOccurrenceId: damaged.occurrenceId, returnToContractor: 'marked' })
          .where(eq(cargoArrivalDocuments.nfeDocumentId, damaged.documentIds[0]))

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: new Date(ARRIVED_AT.getTime() + ONE_HOUR_MS),
          tripId: trip.tripId,
        })

        expect(read.get(damaged.documentIds[0])?.deliveryDeadline).toBeNull()
        expect(read.get(damaged.documentIds[1])?.deliveryDeadline).not.toBeNull()
      })
    },
    60_000,
  )
})
