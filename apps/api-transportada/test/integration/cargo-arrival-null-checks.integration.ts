/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M1): um CHECK cuja expressão vira NULL deixa a linha passar. Cada
 * combinação com NULL que a máquina da chegada não admite é gravada direto no banco e tem de voltar
 * `23514` do CHECK certo — não basta "deu erro".
 */
import { describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  cargoArrivalDocuments,
  cargoArrivalEvents,
  cargoArrivals,
} from '../../src/database/database.schema.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const CHECK_VIOLATION = '23514'
const DUE_AT_CHECK = 'cargo_arrivals_separation_due_at_check'
const STATE_DATES_CHECK = 'cargo_arrival_documents_state_dates_check'
const EVENT_SHAPE_CHECK = 'cargo_arrival_events_state_shape_check'
const ARRIVED_AT = new Date('2026-10-05T12:00:00.000Z')
const DUE_AT = new Date('2026-10-06T12:00:00.000Z')

type Seeded = { readonly arrivalId: string; readonly documentRowId: string }

async function captureViolation(operation: () => PromiseLike<unknown>): Promise<string> {
  try {
    await operation()
    return 'accepted'
  } catch (error) {
    const failure = findPostgresError({ error })
    return `${failure?.sqlState ?? 'not-a-postgres-error'}:${failure?.constraint ?? ''}`
  }
}

async function seedArrival(database: TestDatabase, contractorId: string): Promise<Seeded> {
  const nfeDocumentId = await seedIssuedDocument(database, { number: '501' })
  const [arrival] = await database.db
    .insert(cargoArrivals)
    .values({
      arrivedAt: ARRIVED_AT,
      channel: 'backoffice',
      companyId: COMPANY_CONTEXT.companyId,
      contractorId,
      idempotencyKey: 'null-check-key-0001',
      registeredByUserId: COMPANY_CONTEXT.userId,
      requestFingerprint: 'a'.repeat(64),
      separationDueAt: DUE_AT,
      separationWindowHours: 24,
    })
    .returning({ id: cargoArrivals.id })
  const [document] = await database.db
    .insert(cargoArrivalDocuments)
    .values({
      arrivalId: arrival?.id ?? '',
      companyId: COMPANY_CONTEXT.companyId,
      nfeDocumentId,
    })
    .returning({ id: cargoArrivalDocuments.id })
  return { arrivalId: arrival?.id ?? '', documentRowId: document?.id ?? '' }
}

function insertEvent(
  database: TestDatabase,
  input: Seeded & {
    readonly fromState: 'expected' | 'received' | null
    readonly kind: 'document_added' | 'document_received' | 'document_separated'
    readonly toState: 'expected' | 'received' | 'separated' | null
  },
) {
  return database.db.insert(cargoArrivalEvents).values({
    actorUserId: COMPANY_CONTEXT.userId,
    arrivalDocumentId: input.documentRowId,
    arrivalId: input.arrivalId,
    channel: 'backoffice',
    companyId: COMPANY_CONTEXT.companyId,
    fromState: input.fromState,
    kind: input.kind,
    occurredAt: ARRIVED_AT,
    toState: input.toState,
  })
}

describe('os CHECKs da chegada não deixam o NULL passar (spec 237, M1)', () => {
  testWithPostgres(
    'prazo sem janela e janela sem prazo são recusados pelo CHECK do prazo',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { arrivalId } = await seedArrival(database, tenants.contractorId)
        const byId = eq(cargoArrivals.id, arrivalId)

        expect(
          await captureViolation(() =>
            database.db.update(cargoArrivals).set({ separationDueAt: null }).where(byId),
          ),
        ).toBe(`${CHECK_VIOLATION}:${DUE_AT_CHECK}`)
        expect(
          await captureViolation(() =>
            database.db.update(cargoArrivals).set({ separationWindowHours: null }).where(byId),
          ),
        ).toBe(`${CHECK_VIOLATION}:${DUE_AT_CHECK}`)
        expect(
          await captureViolation(() =>
            database.db
              .update(cargoArrivals)
              .set({ separationDueAt: null, separationWindowHours: null })
              .where(byId),
          ),
        ).toBe('accepted')
      })
    },
  )

  testWithPostgres('nota separada sem a hora da separação é recusada', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { documentRowId } = await seedArrival(database, tenants.contractorId)
      const byId = eq(cargoArrivalDocuments.id, documentRowId)
      const separatedWithoutDate = await captureViolation(() =>
        database.db
          .update(cargoArrivalDocuments)
          .set({ receivedAt: ARRIVED_AT, separatedAt: null, separationState: 'separated' })
          .where(byId),
      )
      expect(separatedWithoutDate).toBe(`${CHECK_VIOLATION}:${STATE_DATES_CHECK}`)
      expect(
        await captureViolation(() =>
          database.db
            .update(cargoArrivalDocuments)
            .set({ receivedAt: sql`null`, separationState: 'received' })
            .where(byId),
        ),
      ).toBe(`${CHECK_VIOLATION}:${STATE_DATES_CHECK}`)
      expect(
        await captureViolation(() =>
          database.db
            .update(cargoArrivalDocuments)
            .set({ receivedAt: ARRIVED_AT, separatedAt: DUE_AT, separationState: 'separated' })
            .where(byId),
        ),
      ).toBe('accepted')
    })
  })

  testWithPostgres('evento de nota sem estado de origem ou de destino é recusado', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const seeded = await seedArrival(database, tenants.contractorId)
      const holes = [
        { fromState: null, kind: 'document_added', toState: null },
        { fromState: null, kind: 'document_received', toState: 'received' },
        { fromState: 'expected', kind: 'document_received', toState: null },
        { fromState: null, kind: 'document_separated', toState: 'separated' },
        { fromState: 'received', kind: 'document_separated', toState: null },
      ] as const
      const outcomes = await Promise.all(
        holes.map((hole) => captureViolation(() => insertEvent(database, { ...seeded, ...hole }))),
      )
      expect(outcomes).toEqual(holes.map(() => `${CHECK_VIOLATION}:${EVENT_SHAPE_CHECK}`))
      expect(
        await captureViolation(() =>
          insertEvent(database, {
            ...seeded,
            fromState: 'expected',
            kind: 'document_received',
            toState: 'received',
          }),
        ),
      ).toBe('accepted')
    })
  })
})
