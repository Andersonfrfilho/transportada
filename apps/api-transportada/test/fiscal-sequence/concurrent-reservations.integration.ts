/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import {
  createReservationInput,
  type ExpectedFiscalNumberReservation,
  type FiscalSequenceFixture,
  INITIAL_NUMBER,
  testWithPostgres,
  withFiscalSequenceFixture,
} from './fiscal-sequence-integration.fixture.js'
import {
  readLedgerNumbers,
  readReservationScopes,
  readSequenceState,
} from './fiscal-sequence-state.fixture.js'

const CONCURRENT_RESERVATION_COUNT = 20

testWithPostgres(
  'reserves unique monotonic numbers for 20 distinct concurrent keys',
  async () => {
    await withFiscalSequenceFixture(assertDistinctReservations)
  },
  30_000,
)

testWithPostgres(
  'returns one first reservation and 19 replays for one concurrent key',
  async () => {
    await withFiscalSequenceFixture(async (fixture) => {
      const input = createReservationInput({
        companyId: fixture.companyId,
        reservationKey: 'shared-concurrent-key',
      })
      const reservations: readonly ExpectedFiscalNumberReservation[] = await Promise.all(
        Array.from({ length: CONCURRENT_RESERVATION_COUNT }, async () =>
          fixture.reservationPort.reserve(input),
        ),
      )

      expect(new Set(reservations.map(({ number }) => number))).toEqual(new Set([INITIAL_NUMBER]))
      expect(new Set(reservations.map(({ sequenceId }) => sequenceId)).size).toBe(1)
      expect(reservations.filter(({ isReplay }) => !isReplay)).toHaveLength(1)
      expect(reservations.filter(({ isReplay }) => isReplay)).toHaveLength(19)
      const [scope] = await readReservationScopes(fixture.database)
      const [first] = reservations
      if (scope === undefined || first === undefined) {
        throw new Error('Synthetic shared reservation is missing')
      }
      expect(scope).toMatchObject({
        number: first.number,
        reservationKey: input.reservationKey,
        sequenceId: first.sequenceId,
      })
      expect(await readLedgerNumbers(fixture)).toEqual([INITIAL_NUMBER])
      const sequence = await readSequenceState(fixture)
      expect(sequence).toMatchObject({
        lastReservedNumber: INITIAL_NUMBER,
        nextNumber: INITIAL_NUMBER + 1n,
      })
      expect(first.sequenceId).toBe(sequence.id)
    })
  },
  30_000,
)

async function assertDistinctReservations(fixture: FiscalSequenceFixture): Promise<void> {
  const reservations = await reserveDistinctKeys(fixture)
  const sortedNumbers = reservations
    .map(({ number }) => number)
    .sort((first, second) => compareBigints({ first, second }))
  const expectedNumbers = Array.from(
    { length: CONCURRENT_RESERVATION_COUNT },
    (_value, index) => INITIAL_NUMBER + BigInt(index),
  )
  expect(sortedNumbers).toEqual(expectedNumbers)
  expect(new Set(sortedNumbers).size).toBe(CONCURRENT_RESERVATION_COUNT)
  expect(reservations.every(({ isReplay }) => !isReplay)).toBe(true)
  await assertDistinctPersistence({ expectedNumbers, fixture, reservations })
}

async function reserveDistinctKeys(
  fixture: FiscalSequenceFixture,
): Promise<readonly ExpectedFiscalNumberReservation[]> {
  return await Promise.all(
    Array.from({ length: CONCURRENT_RESERVATION_COUNT }, (_value, index) =>
      fixture.reservationPort.reserve(
        createReservationInput({
          companyId: fixture.companyId,
          reservationKey: `distinct-${index}`,
        }),
      ),
    ),
  )
}

async function assertDistinctPersistence(input: {
  readonly expectedNumbers: readonly bigint[]
  readonly fixture: FiscalSequenceFixture
  readonly reservations: readonly ExpectedFiscalNumberReservation[]
}): Promise<void> {
  const scopes = await readReservationScopes(input.fixture.database)
  expect(scopes).toHaveLength(CONCURRENT_RESERVATION_COUNT)
  expect(scopes).toEqual(
    expect.arrayContaining(
      input.reservations.map((reservation, index) => ({
        companyId: input.fixture.companyId,
        environment: 'homologation',
        model: 'cte',
        number: reservation.number,
        reservationKey: `distinct-${index}`,
        sequenceId: reservation.sequenceId,
        series: 1n,
      })),
    ),
  )
  expect(await readLedgerNumbers(input.fixture)).toEqual(input.expectedNumbers)
  expect(await readSequenceState(input.fixture)).toMatchObject({
    lastReservedNumber: INITIAL_NUMBER + BigInt(CONCURRENT_RESERVATION_COUNT - 1),
    nextNumber: INITIAL_NUMBER + BigInt(CONCURRENT_RESERVATION_COUNT),
  })
}

type CompareBigintsParams = {
  readonly first: bigint
  readonly second: bigint
}

function compareBigints(input: CompareBigintsParams): number {
  if (input.first < input.second) return -1
  if (input.first > input.second) return 1
  return 0
}
