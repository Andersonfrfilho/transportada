/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 T4.1/T4.2 (RF4), contra Postgres real: `documents[].proofPending` no detalhe da viagem —
 * nota baixada, sem foto de canhoto, sob configuração que exige canhoto. Derivado na leitura, nunca
 * gravado, e pela mesma regra de `resolveProofPendingFlag`.
 */
import { describe, expect } from 'bun:test'

import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import {
  seedProofPendingScenario,
  seedRecipientOverride,
  type ProofPendingScenario,
} from '../fixtures/proof-pending-scenario.fixture.js'
import {
  testWithPostgres,
  withDisposableDatabase,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

async function readPendingByDocument(
  database: TestDatabase,
  scenario: ProofPendingScenario,
): Promise<ReadonlyMap<string, boolean | undefined>> {
  const detail = await new DrizzleTripRepository(database.db).findById({
    companyId: scenario.company.companyId,
    tripId: scenario.trip.tripId,
  })
  return new Map(detail?.documents.map((document) => [document.id, document.proofPending]))
}

describe('proofPending no detalhe da viagem (spec 223 T4.1)', () => {
  testWithPostgres(
    'photo required: baixada sem foto é pendente; com foto e ainda não baixada não são',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedProofPendingScenario(database, {
          photo: 'required',
          signature: 'optional',
        })
        await scenario.deliver(scenario.trip.documentId, { withPhoto: false })
        await scenario.deliver(scenario.withPhotoDocumentId, { withPhoto: true })

        const pending = await readPendingByDocument(database, scenario)

        expect(pending.get(scenario.trip.documentId)).toBe(true)
        expect(pending.get(scenario.withPhotoDocumentId)).toBe(false)
        expect(pending.get(scenario.loadedDocumentId)).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'signature required sem photo required também cobra o canhoto (RF3)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedProofPendingScenario(database, {
          photo: 'optional',
          signature: 'required',
        })
        await scenario.deliver(scenario.trip.documentId, { withPhoto: false })

        const pending = await readPendingByDocument(database, scenario)

        expect(pending.get(scenario.trip.documentId)).toBe(true)
      })
    },
    60_000,
  )

  testWithPostgres(
    'configuração que não exige canhoto nunca marca pendência',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedProofPendingScenario(database, {
          photo: 'optional',
          signature: 'off',
        })
        await scenario.deliver(scenario.trip.documentId, { withPhoto: false })

        const pending = await readPendingByDocument(database, scenario)

        expect(pending.get(scenario.trip.documentId)).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'a exceção do destinatário vence a geral: geral exige, exceção dispensa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedProofPendingScenario(database, {
          photo: 'required',
          signature: 'optional',
        })
        await seedRecipientOverride(database, scenario, {
          documentId: scenario.trip.documentId,
          modes: { photo: 'optional', signature: 'optional' },
          taxId: '12345678000190',
        })
        await scenario.deliver(scenario.trip.documentId, { withPhoto: false })
        await scenario.deliver(scenario.withPhotoDocumentId, { withPhoto: false })

        const pending = await readPendingByDocument(database, scenario)

        expect(pending.get(scenario.trip.documentId)).toBe(false)
        expect(pending.get(scenario.withPhotoDocumentId)).toBe(true)
      })
    },
    60_000,
  )
})
