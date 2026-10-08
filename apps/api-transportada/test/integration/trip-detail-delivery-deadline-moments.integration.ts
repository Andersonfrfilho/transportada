/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2d (CA2), contra Postgres real: o calendário de fim de ano, a entrega medida pelo
 * momento da 234, as notas que o prazo não alcança e o isolamento entre empresas.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { nfeDocuments, tripDocuments } from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  SAO_CARLOS,
  withCargoDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ARRIVED_TUESDAY,
  readDeadlines,
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

describe('o prazo de entrega: calendário, entrega e isolamento (spec 236 T1.2d)', () => {
  testWithPostgres(
    'chegada em 30/12 pede o calendário do ano seguinte',
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
          arrivedAt: new Date('2026-12-30T15:00:00.000Z'),
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: 3,
          documentIds: [documentId],
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: new Date('2026-12-31T15:00:00.000Z'),
          tripId: trip.tripId,
        })

        // 31/12 (1), 01/01 é feriado, 02/01 é sábado, 04/01 (2) e 05/01 (3).
        expect(read.get(documentId)?.deliveryDeadline).toMatchObject({
          dueOn: '2027-01-05',
          state: 'on_time',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'a entrega é medida pelo momento da 234, não pela chegada ao servidor',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await database.db
          .update(tripDocuments)
          .set({ deliveredAt: new Date('2026-10-17T12:00:00.000Z'), separationStatus: 'delivered' })
          .where(eq(tripDocuments.id, arrived.tripDocumentId))
        // 23:00 de sexta (dia do vencimento) em São Paulo, gravado no sábado.
        await seedDeliveredEvent(database, {
          companyId: COMPANY_ID,
          occurredAt: new Date('2026-10-17T02:00:00.000Z'),
          recordedAt: new Date('2026-10-17T12:00:00.000Z'),
          stopId: arrived.trip.stopId,
          tripDocumentId: arrived.tripDocumentId,
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: new Date('2026-10-19T15:00:00.000Z'),
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toEqual({
          deliveredOn: '2026-10-16',
          dueOn: '2026-10-16',
          state: 'delivered_on_time',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'nota devolvida, cancelada ou liberada fica sem prazo; a aberta segue',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const ids = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 4,
          emitterTaxId: ISSUER_TAX_ID,
        })
        const [returned, cancelled, released, open] = ids as [string, string, string, string]
        const trip = await seedTripWithNotes(database, { companyId: COMPANY_ID, documentIds: ids })
        await seedArrival(database, {
          arrivedAt: ARRIVED_TUESDAY,
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: 3,
          documentIds: ids,
        })
        const documentOf = (nfeDocumentId: string) => trip.tripDocumentIds.get(nfeDocumentId) ?? ''
        await database.db
          .update(tripDocuments)
          .set({ returnReason: 'recusada', separationStatus: 'returned' })
          .where(eq(tripDocuments.id, documentOf(returned)))
        await database.db
          .update(nfeDocuments)
          .set({ status: 'cancelled' })
          .where(eq(nfeDocuments.id, cancelled))
        await database.db
          .update(tripDocuments)
          .set({ releasedAt: new Date('2026-10-14T10:00:00.000Z') })
          .where(eq(tripDocuments.id, documentOf(released)))

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: trip.tripId,
        })

        expect(read.get(returned)?.deliveryDeadline).toBeNull()
        expect(read.get(cancelled)?.deliveryDeadline).toBeNull()
        expect(read.get(released)?.deliveryDeadline).toBeNull()
        expect(read.get(open)?.deliveryDeadline).toMatchObject({ state: 'on_time' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'a viagem de uma empresa nunca lê o feriado nem a viagem de outra',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        // Feriado da outra empresa na mesma cidade, no dia do vencimento: não pode contar aqui.
        await seedTypedHoliday(database, {
          cityIbgeCode: SAO_CARLOS,
          companyId: tenants.foreignCompanyId,
          holidayOn: '2026-10-15',
        })

        const own = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })
        const foreign = await readDeadlines(database, {
          companyId: tenants.foreignCompanyId,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })

        expect(own.get(arrived.documentId)?.deliveryDeadline).toMatchObject({
          dueOn: '2026-10-16',
        })
        expect(foreign.size).toBe(0)
      })
    },
    60_000,
  )
})
