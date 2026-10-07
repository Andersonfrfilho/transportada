/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M7): idempotência e trava sob concorrência de verdade. Cada caso
 * segura as linhas disputadas numa transação bloqueadora até as duas escritas estarem paradas num
 * lock, e só então solta — a corrida acontece em toda execução.
 */
import { describe, expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'

import {
  cargoArrivalEvents,
  cargoArrivals,
  contractorReceivingProfiles,
  nfeDocuments,
} from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  OTHER_ISSUER_TAX_ID,
  seedIssuedDocument,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival,
  createCargoArrivalHandler,
  type CargoArrivalHandle,
} from '../fixtures/cargo-arrival-http.fixture.js'
import { raceUnderBlocker, withCargoRaceDatabase } from '../fixtures/cargo-arrival-race.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const ARRIVED_AT = new Date(Date.now() - 3_600_000).toISOString()
const SHARED_KEY = 'arrival-race-key-0001'

type Outcome = { readonly code: unknown; readonly status: number }

function register(
  handle: CargoArrivalHandle,
  input: { readonly contractorId: string; readonly documentIds: readonly string[] },
): () => Promise<Outcome> {
  const body = { arrivedAt: ARRIVED_AT, ...input }
  return async () => {
    const { body: response, status } = await callCargoArrival(
      handle,
      buildPostRequest({ body, key: SHARED_KEY, path: '/cargo-arrivals' }),
    )
    return { code: response.error?.code, status }
  }
}

function settledOutcomes(results: PromiseSettledResult<Outcome>[]): Outcome[] {
  return results
    .map((result) =>
      result.status === 'fulfilled' ? result.value : { code: 'rejected', status: 0 },
    )
    .toSorted((left, right) => left.status - right.status)
}

describe('a chegada sob concorrência (spec 237, M7)', () => {
  testWithPostgres(
    'mesma chave e mesmo pedido em paralelo: 201 e 200, uma chegada só',
    async () => {
      await withCargoRaceDatabase(async (race) => {
        const handle = createCargoArrivalHandler({ database: race.database })
        const documentId = await seedIssuedDocument(race.database, { number: '701' })
        const request = { contractorId: race.tenants.contractorId, documentIds: [documentId] }

        const results = await raceUnderBlocker({
          block: (transaction) =>
            transaction
              .select()
              .from(nfeDocuments)
              .where(eq(nfeDocuments.id, documentId))
              .for('update'),
          race,
          waiters: 2,
          writes: [register(handle, request), register(handle, request)],
        })

        expect(settledOutcomes(results)).toEqual([
          { code: undefined, status: 200 },
          { code: undefined, status: 201 },
        ])
        expect(await race.database.db.select().from(cargoArrivals)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'mesma chave por outro contratante em paralelo: 201 e 409 pelo unique',
    async () => {
      await withCargoRaceDatabase(async (race) => {
        const handle = createCargoArrivalHandler({ database: race.database })
        await race.database.db.insert(contractorReceivingProfiles).values({
          companyId: COMPANY_CONTEXT.companyId,
          contractorId: race.tenants.otherContractorId,
          isEnabled: true,
        })
        const ownDocument = await seedIssuedDocument(race.database, { number: '702' })
        const otherDocument = await seedIssuedDocument(race.database, {
          emitterTaxId: OTHER_ISSUER_TAX_ID,
          number: '703',
        })

        const results = await raceUnderBlocker({
          block: (transaction) =>
            transaction
              .select()
              .from(nfeDocuments)
              .where(inArray(nfeDocuments.id, [ownDocument, otherDocument]))
              .for('update'),
          race,
          waiters: 2,
          writes: [
            register(handle, {
              contractorId: race.tenants.contractorId,
              documentIds: [ownDocument],
            }),
            register(handle, {
              contractorId: race.tenants.otherContractorId,
              documentIds: [otherDocument],
            }),
          ],
        })

        expect(settledOutcomes(results)).toEqual([
          { code: undefined, status: 201 },
          { code: 'CARGO_ARRIVAL_KEY_REUSED', status: 409 },
        ])
        expect(await race.database.db.select().from(cargoArrivals)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'dois lotes em paralelo na mesma chegada: sem deadlock, um evento por nota',
    async () => {
      await withCargoRaceDatabase(async (race) => {
        const handle = createCargoArrivalHandler({ database: race.database })
        const documentIds = [
          await seedIssuedDocument(race.database, { number: '704' }),
          await seedIssuedDocument(race.database, { number: '705' }),
        ]
        const created = await register(handle, {
          contractorId: race.tenants.contractorId,
          documentIds,
        })()
        expect(created.status).toBe(201)
        const [arrival] = await race.database.db
          .select({ id: cargoArrivals.id })
          .from(cargoArrivals)
        const arrivalId = arrival?.id ?? ''
        const batch = (ids: readonly string[]) => async (): Promise<Outcome> => {
          const path = `/cargo-arrivals/${arrivalId}/documents/batch-status`
          const result = await callCargoArrival(
            handle,
            buildPostRequest({ body: { documentIds: ids, to: 'received' }, path }),
          )
          return { code: result.body.error?.code, status: result.status }
        }

        const results = await raceUnderBlocker({
          block: (transaction) =>
            transaction
              .select()
              .from(cargoArrivals)
              .where(eq(cargoArrivals.id, arrivalId))
              .for('update'),
          race,
          waiters: 2,
          writes: [batch(documentIds), batch(documentIds.toReversed())],
        })

        expect(settledOutcomes(results)).toEqual([
          { code: undefined, status: 200 },
          { code: undefined, status: 200 },
        ])
        const received = await race.database.db
          .select({ documentRowId: cargoArrivalEvents.arrivalDocumentId })
          .from(cargoArrivalEvents)
          .where(eq(cargoArrivalEvents.kind, 'document_received'))
        expect(received).toHaveLength(documentIds.length)
        expect(new Set(received.map((row) => row.documentRowId)).size).toBe(documentIds.length)
      })
    },
  )
})
