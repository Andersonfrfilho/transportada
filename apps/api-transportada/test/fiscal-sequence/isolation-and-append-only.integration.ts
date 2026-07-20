/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { fiscalSequenceReservations } from '../../src/database/database.schema.js'
import {
  createReservationInput,
  type ExpectedFiscalNumberReservation,
  INITIAL_NUMBER,
  SECONDARY_SERIES,
  testWithPostgres,
  type FiscalSequenceFixture,
  withFiscalSequenceFixture,
} from './fiscal-sequence-integration.fixture.js'
import { readLedgerNumbers, readReservationScopes } from './fiscal-sequence-state.fixture.js'

testWithPostgres(
  'isolates exact company, environment, and caller-selected series',
  async () => {
    await withFiscalSequenceFixture(assertIsolatedScopes)
  },
  30_000,
)

testWithPostgres(
  'keeps confirmed reservations append-only and never reuses their numbers',
  async () => {
    await withFiscalSequenceFixture(async (fixture) => {
      const first = await fixture.reservationPort.reserve(
        createReservationInput({
          companyId: fixture.companyId,
          reservationKey: 'append-only-first',
        }),
      )
      expect(first.number).toBe(INITIAL_NUMBER)
      const reservationId = await findReservationId({
        fixture,
        reservationKey: 'append-only-first',
      })
      await expect(
        fixture.database.db
          .update(fiscalSequenceReservations)
          .set({ number: INITIAL_NUMBER + 100n })
          .where(eq(fiscalSequenceReservations.id, reservationId)),
      ).rejects.toThrow()
      await expect(
        fixture.database.db
          .delete(fiscalSequenceReservations)
          .where(eq(fiscalSequenceReservations.companyId, fixture.companyId)),
      ).rejects.toThrow()

      const second = await fixture.reservationPort.reserve(
        createReservationInput({
          companyId: fixture.companyId,
          reservationKey: 'append-only-second',
        }),
      )
      expect(second.number).toBe(INITIAL_NUMBER + 1n)
      expect(await readLedgerNumbers(fixture)).toEqual([INITIAL_NUMBER, INITIAL_NUMBER + 1n])
    })
  },
  30_000,
)

async function assertIsolatedScopes(fixture: FiscalSequenceFixture): Promise<void> {
  const intentions = isolationIntentions(fixture)
  const reservations: readonly ExpectedFiscalNumberReservation[] = await Promise.all(
    intentions.map((input) => fixture.reservationPort.reserve(input)),
  )
  expect(reservations.map(({ number }) => number)).toEqual(
    Array.from({ length: intentions.length }, () => INITIAL_NUMBER),
  )
  expect(new Set(reservations.map(({ sequenceId }) => sequenceId)).size).toBe(4)
  const expectedScopes = intentions.map((intention, index) => ({
    ...intention,
    number: INITIAL_NUMBER,
    sequenceId: requiredReservation({ index, reservations }).sequenceId,
  }))
  const scopes = await readReservationScopes(fixture.database)
  expect(scopes).toHaveLength(expectedScopes.length)
  expect(scopes).toEqual(expect.arrayContaining(expectedScopes))
}

function isolationIntentions(
  fixture: FiscalSequenceFixture,
): readonly ReturnType<typeof createReservationInput>[] {
  return [
    createReservationInput({ companyId: fixture.companyId, reservationKey: 'company-hom' }),
    createReservationInput({
      companyId: fixture.companyId,
      environment: 'production',
      reservationKey: 'company-prod',
    }),
    createReservationInput({
      companyId: fixture.companyId,
      reservationKey: 'company-series-two',
      series: SECONDARY_SERIES,
    }),
    createReservationInput({
      companyId: fixture.otherCompanyId,
      reservationKey: 'company-hom',
    }),
  ]
}

function requiredReservation(input: {
  readonly index: number
  readonly reservations: readonly ExpectedFiscalNumberReservation[]
}): ExpectedFiscalNumberReservation {
  const reservation = input.reservations[input.index]
  if (reservation === undefined) throw new Error('Synthetic reservation result is missing')
  return reservation
}

type FindReservationIdParams = {
  readonly fixture: FiscalSequenceFixture
  readonly reservationKey: string
}

async function findReservationId(input: FindReservationIdParams): Promise<string> {
  const [reservation] = await input.fixture.database.db
    .select({ id: fiscalSequenceReservations.id })
    .from(fiscalSequenceReservations)
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.fixture.companyId),
        eq(fiscalSequenceReservations.reservationKey, input.reservationKey),
      ),
    )
  if (reservation === undefined) throw new Error('Synthetic fiscal reservation is missing')
  return reservation.id
}
