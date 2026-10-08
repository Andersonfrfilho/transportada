/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2a/c, contra Postgres real e o driver de produção: o detalhe que responde a uma ESCRITA
 * (`close`) roda dentro da transação, e as consultas do prazo — desvio, entrega e as quatro do calendário
 * — têm de voltar ali, uma de cada vez. Consulta concorrente numa transação do Bun SQL pode nunca voltar.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { trips } from '../../src/database/trip.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { hasTestDatabase, withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ACTOR_USER_ID,
  seedArrivedNote,
  WEDNESDAY_NOON,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip

describe('o prazo de entrega dentro da transação da escrita (spec 236 T1.2a)', () => {
  testWithPostgres(
    'close devolve o detalhe com o prazo, calculado na própria transação',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const arrived = await seedArrivedNote(database, tenants)
        await database.db
          .update(trips)
          .set({ status: 'in_transit' })
          .where(eq(trips.id, arrived.trip.tripId))
        const repository = new DrizzleTripRepository(database.db, undefined, {
          clock: { now: () => WEDNESDAY_NOON },
        })

        const detail = await repository.close({
          actorUserId: ACTOR_USER_ID,
          channel: 'backoffice',
          closeReason: 'encerrada no teste',
          companyId: COMPANY_CONTEXT.companyId,
          correlationId: 'correlation-deadline-close',
          ipAddress: '203.0.113.7',
          onBehalfOfDriverId: null,
          tripId: arrived.trip.tripId,
        })

        expect(detail?.status).toBe('completed')
        expect(detail?.documents[0]?.deliveryDeadline).toMatchObject({
          dueOn: '2026-10-16',
          state: 'on_time',
        })
      })
    },
    60_000,
  )
})
