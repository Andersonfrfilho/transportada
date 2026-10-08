/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2e, contra Postgres real: as bordas que a revisão da Fase 1 apontou. A entrega sem
 * evento não é medida pela hora do servidor, dois contratantes na mesma viagem, chegada sem prazo
 * copiado, o desvio manual mais recente vence e a viagem entregue lida anos depois.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripDocuments } from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  OTHER_ISSUER_TAX_ID,
  withCargoDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ARRIVED_TUESDAY,
  CAMPINAS,
  readDeadlines,
  seedAddressOverride,
  seedArrivedNote,
  seedArrival,
  seedDeliveredEvent,
  seedNotes,
  seedTripWithNotes,
  seedTypedHoliday,
  WEDNESDAY_NOON,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId

describe('o prazo de entrega: bordas da revisão (spec 236 T1.2e)', () => {
  testWithPostgres(
    'entregue pelo servidor, sem evento: a hora do clique não mede a entrega (null)',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await database.db
          .update(tripDocuments)
          .set({ deliveredAt: new Date('2026-10-14T12:00:00.000Z'), separationStatus: 'delivered' })
          .where(eq(tripDocuments.id, arrived.tripDocumentId))

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: new Date('2026-10-19T15:00:00.000Z'),
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'dois contratantes na mesma viagem: o sem chegada fica null e o outro mantém o prazo',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const [withArrival] = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 1,
          emitterTaxId: ISSUER_TAX_ID,
        })
        const [withoutArrival] = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 1,
          emitterTaxId: OTHER_ISSUER_TAX_ID,
        })
        if (withArrival === undefined || withoutArrival === undefined) {
          throw new Error('EXPECTED_NOTES')
        }
        const trip = await seedTripWithNotes(database, {
          companyId: COMPANY_ID,
          documentIds: [withArrival, withoutArrival],
        })
        await seedArrival(database, {
          arrivedAt: ARRIVED_TUESDAY,
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: 3,
          documentIds: [withArrival],
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: trip.tripId,
        })

        expect(read.get(withArrival)?.deliveryDeadline).toMatchObject({ state: 'on_time' })
        expect(read.get(withoutArrival)?.deliveryDeadline).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'chegada com o prazo copiado nulo: a nota fica sem prazo',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const [documentId] = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 1,
          emitterTaxId: ISSUER_TAX_ID,
        })
        if (documentId === undefined) throw new Error('EXPECTED_NOTE')
        const trip = await seedTripWithNotes(database, {
          companyId: COMPANY_ID,
          documentIds: [documentId],
        })
        await seedArrival(database, {
          arrivedAt: ARRIVED_TUESDAY,
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: null,
          documentIds: [documentId],
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: trip.tripId,
        })

        expect(read.get(documentId)?.deliveryDeadline).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'dois desvios manuais na mesma nota: vale o mais recente, qualquer que seja a ordem de gravação',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await seedTypedHoliday(database, {
          cityIbgeCode: CAMPINAS,
          companyId: COMPANY_ID,
          holidayOn: '2026-10-15',
        })
        await seedAddressOverride(database, {
          companyId: COMPANY_ID,
          createdAt: new Date('2026-10-14T13:00:00.000Z'),
          newCityCode: null,
          tripDocumentId: arrived.tripDocumentId,
        })
        await seedAddressOverride(database, {
          companyId: COMPANY_ID,
          createdAt: new Date('2026-10-14T14:00:00.000Z'),
          newCityCode: CAMPINAS,
          tripDocumentId: arrived.tripDocumentId,
        })
        await seedAddressOverride(database, {
          companyId: COMPANY_ID,
          createdAt: new Date('2026-10-14T12:00:00.000Z'),
          newCityCode: '3548906',
          tripDocumentId: arrived.tripDocumentId,
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toMatchObject({
          dueOn: '2026-10-19',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'viagem toda entregue lida anos depois mantém o selo da entrega',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await database.db
          .update(tripDocuments)
          .set({ separationStatus: 'delivered' })
          .where(eq(tripDocuments.id, arrived.tripDocumentId))
        await seedDeliveredEvent(database, {
          companyId: COMPANY_ID,
          occurredAt: new Date('2026-10-14T15:00:00.000Z'),
          recordedAt: new Date('2026-10-14T15:00:00.000Z'),
          stopId: arrived.trip.stopId,
          tripDocumentId: arrived.tripDocumentId,
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: new Date('2032-06-10T15:00:00.000Z'),
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toEqual({
          deliveredOn: '2026-10-14',
          dueOn: '2026-10-16',
          state: 'delivered_on_time',
        })
      })
    },
    60_000,
  )
})
