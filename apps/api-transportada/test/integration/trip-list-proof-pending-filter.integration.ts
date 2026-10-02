/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 T4.3/T4.4 (RF9), contra Postgres real: o filtro `proofPendingEq` da lista reescreve em
 * SQL a regra que o detalhe roda em TypeScript. Este teste prende as duas: a viagem entra em
 * `proofPendingEq=true` exatamente quando alguma nota do detalhe tem `proofPending`.
 */
import { describe, expect } from 'bun:test'

import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import {
  seedProofPendingScenario,
  seedRecipientOverride,
  type ProofModes,
} from '../fixtures/proof-pending-scenario.fixture.js'
import {
  testWithPostgres,
  withDisposableDatabase,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

type ParityCase = {
  readonly name: string
  readonly modes: ProofModes
  readonly overrideModes?: ProofModes
  readonly withPhoto: boolean
}

const CASES: readonly ParityCase[] = [
  { modes: { photo: 'required', signature: 'optional' }, name: 'photo required', withPhoto: false },
  {
    modes: { photo: 'required', signature: 'optional' },
    name: 'photo required, com foto',
    withPhoto: true,
  },
  {
    modes: { photo: 'optional', signature: 'required' },
    name: 'signature required',
    withPhoto: false,
  },
  { modes: { photo: 'optional', signature: 'off' }, name: 'nada exigido', withPhoto: false },
  {
    modes: { photo: 'required', signature: 'required' },
    name: 'exceção dispensa',
    overrideModes: { photo: 'optional', signature: 'optional' },
    withPhoto: false,
  },
  {
    modes: { photo: 'optional', signature: 'optional' },
    name: 'exceção exige',
    overrideModes: { photo: 'required', signature: 'optional' },
    withPhoto: false,
  },
]

async function listIds(
  database: TestDatabase,
  input: { readonly companyId: string; readonly proofPendingEq: boolean },
): Promise<readonly string[]> {
  const page = await new DrizzleTripRepository(database.db).list({
    companyId: input.companyId,
    cursor: null,
    filters: { proofPendingEq: input.proofPendingEq },
    limit: 50,
  })
  return page.items.map((trip) => trip.id)
}

describe('filtro proofPendingEq da lista de viagens (spec 223 T4.3)', () => {
  for (const parityCase of CASES) {
    testWithPostgres(
      `paridade com o detalhe: ${parityCase.name}`,
      async () => {
        await withDisposableDatabase(async (database) => {
          const scenario = await seedProofPendingScenario(database, parityCase.modes)
          if (parityCase.overrideModes !== undefined) {
            await seedRecipientOverride(database, scenario, {
              documentId: scenario.trip.documentId,
              modes: parityCase.overrideModes,
              taxId: '12345678000190',
            })
          }
          await scenario.deliver(scenario.trip.documentId, { withPhoto: parityCase.withPhoto })
          const companyId = scenario.company.companyId
          const detail = await new DrizzleTripRepository(database.db).findById({
            companyId,
            tripId: scenario.trip.tripId,
          })
          const detailHasPending = detail?.documents.some((document) => document.proofPending)

          const withPending = await listIds(database, { companyId, proofPendingEq: true })
          const withoutPending = await listIds(database, { companyId, proofPendingEq: false })

          expect(withPending.includes(scenario.trip.tripId)).toBe(detailHasPending === true)
          expect(withoutPending.includes(scenario.trip.tripId)).toBe(detailHasPending !== true)
        })
      },
      60_000,
    )
  }
})
