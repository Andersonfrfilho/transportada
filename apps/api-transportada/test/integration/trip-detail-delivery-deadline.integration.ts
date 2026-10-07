/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2d (CA2), contra Postgres real: `documents[].deliveryDeadline` no detalhe da viagem.
 * Chegada e prazo vêm da CÓPIA gravada na chegada, e a cidade vem do destino físico com o desvio manual
 * por cima. Entrega, notas encerradas e isolamento: `trip-detail-delivery-deadline-moments.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractorReceivingProfiles } from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  OTHER_ISSUER_TAX_ID,
  withCargoDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  CAMPINAS,
  readDeadlines,
  seedAddressOverride,
  seedArrivedNote,
  seedNotes,
  seedTripWithNotes,
  seedTypedHoliday,
  WEDNESDAY_NOON,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId

describe('o prazo de entrega no detalhe da viagem (spec 236 T1.2d, CA2)', () => {
  testWithPostgres(
    'só a nota com chegada tem prazo; contratante sem perfil e nota solta ficam null',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        const [otherContractorNote] = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 1,
          emitterTaxId: OTHER_ISSUER_TAX_ID,
        })
        const [unregisteredNote] = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 1,
          emitterTaxId: ISSUER_TAX_ID,
        })
        if (otherContractorNote === undefined || unregisteredNote === undefined) {
          throw new Error('EXPECTED_NOTES')
        }
        const loose = await seedTripWithNotes(database, {
          companyId: COMPANY_ID,
          documentIds: [otherContractorNote, unregisteredNote],
        })

        const first = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })
        const second = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: loose.tripId,
        })

        expect(first.get(arrived.documentId)?.deliveryDeadline).toEqual({
          businessDaysRemaining: 2,
          dueOn: '2026-10-16',
          state: 'on_time',
        })
        expect(second.get(otherContractorNote)?.deliveryDeadline).toBeNull()
        expect(second.get(unregisteredNote)?.deliveryDeadline).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'o perfil muda de 3 para 5 dias depois da chegada: vale a cópia',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await database.db
          .update(contractorReceivingProfiles)
          .set({ deliveryDeadlineBusinessDays: 5 })
          .where(eq(contractorReceivingProfiles.contractorId, tenants.contractorId))

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toMatchObject({
          dueOn: '2026-10-16',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'o desvio manual para cidade com feriado muda o vencimento',
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
          newCityCode: CAMPINAS,
          tripDocumentId: arrived.tripDocumentId,
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })

        // 14/10 (1), 15/10 é feriado em Campinas, 16/10 (2), 19/10 (3).
        expect(read.get(arrived.documentId)?.deliveryDeadline).toMatchObject({
          dueOn: '2026-10-19',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'desvio manual sem cidade deixa a nota sem prazo',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await seedAddressOverride(database, {
          companyId: COMPANY_ID,
          newCityCode: null,
          tripDocumentId: arrived.tripDocumentId,
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: WEDNESDAY_NOON,
          tripId: arrived.trip.tripId,
        })

        expect(read.get(arrived.documentId)?.deliveryDeadline).toBeNull()
      })
    },
    60_000,
  )
})
