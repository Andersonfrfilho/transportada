/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, L5): as horas da conferência e da separação saem do relógio do
 * banco, não do processo. Duas réplicas com relógios defasados não podem gravar a separação antes da
 * conferência — o CHECK `separated_at >= received_at` recusaria com 500.
 */
import { describe, expect, test } from 'bun:test'

import { cargoArrivalDocuments } from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival,
  createCargoArrivalHandler,
} from '../fixtures/cargo-arrival-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const HOUR_MS = 3_600_000

describe('o relógio da separação é o do banco (spec 237, L5)', () => {
  testWithPostgres(
    'separar com o relógio do processo atrasado ainda grava depois da conferência',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const onTime = createCargoArrivalHandler({ database })
        const late = createCargoArrivalHandler({
          database,
          now: () => new Date(Date.now() - HOUR_MS),
        })
        const documentId = await seedIssuedDocument(database, { number: '801' })
        const created = await callCargoArrival(
          onTime,
          buildPostRequest({
            body: {
              arrivedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
              contractorId: tenants.contractorId,
              documentIds: [documentId],
            },
            key: 'arrival-clock-key-0001',
            path: '/cargo-arrivals',
          }),
        )
        const base = `/cargo-arrivals/${String(created.body.data?.id)}/documents/${documentId}`

        expect(
          (await callCargoArrival(onTime, buildPostRequest({ path: `${base}/receive` }))).status,
        ).toBe(200)
        const separated = await callCargoArrival(
          late,
          buildPostRequest({ path: `${base}/separate` }),
        )

        expect(separated.status).toBe(200)
        const [row] = await database.db.select().from(cargoArrivalDocuments)
        expect(row?.separationState).toBe('separated')
        expect(
          (row?.separatedAt?.getTime() ?? 0) >= (row?.receivedAt?.getTime() ?? Infinity),
        ).toBeTrue()
      })
    },
  )
})
