/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { fiscalSequenceReservations } from '../../src/database/database.schema.js'
import {
  createReservationInput,
  INITIAL_NUMBER,
  testWithPostgres,
  withFiscalSequenceFixture,
} from './fiscal-sequence-integration.fixture.js'
import { readLedgerNumbers, readSequenceState } from './fiscal-sequence-state.fixture.js'

const NUMBER_UNIQUE_CONSTRAINT = 'fiscal_sequence_reservations_sequence_id_number_unique'

testWithPostgres(
  'does not recover an unrelated 23505 as an idempotent replay',
  async () => {
    await withFiscalSequenceFixture(async (fixture) => {
      const sequence = await readSequenceState(fixture)
      await fixture.database.db.insert(fiscalSequenceReservations).values({
        companyId: fixture.companyId,
        fiscalSequenceId: sequence.id,
        number: INITIAL_NUMBER,
        reservationKey: 'unexpected-number-owner',
      })

      try {
        await fixture.reservationPort.reserve(
          createReservationInput({
            companyId: fixture.companyId,
            reservationKey: 'unexpected-number-contender',
          }),
        )
        throw new Error('Expected an unrelated unique violation')
      } catch (error) {
        expect(postgresErrorDetails({ error })).toEqual({
          constraint: NUMBER_UNIQUE_CONSTRAINT,
          sqlState: '23505',
        })
      }

      expect(await readSequenceState(fixture)).toMatchObject({
        lastReservedNumber: null,
        nextNumber: INITIAL_NUMBER,
      })
      expect(await readLedgerNumbers(fixture)).toEqual([INITIAL_NUMBER])
    })
  },
  30_000,
)

type PostgresErrorDetails = {
  readonly constraint: string | undefined
  readonly sqlState: string | undefined
}

function postgresErrorDetails(input: {
  readonly depth?: number
  readonly error: unknown
}): PostgresErrorDetails | null {
  const depth = input.depth ?? 0
  if (depth > 3 || typeof input.error !== 'object' || input.error === null) return null
  const candidate = input.error as {
    readonly cause?: unknown
    readonly code?: unknown
    readonly constraint?: unknown
    readonly errno?: unknown
  }
  if (typeof candidate.constraint === 'string') {
    return {
      constraint: candidate.constraint,
      sqlState:
        typeof candidate.errno === 'string'
          ? candidate.errno
          : typeof candidate.code === 'string'
            ? candidate.code
            : undefined,
    }
  }
  return postgresErrorDetails({ depth: depth + 1, error: candidate.cause })
}
