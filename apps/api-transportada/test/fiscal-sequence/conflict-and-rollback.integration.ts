/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import { fiscalSequenceReservations, fiscalSequences } from '../../src/database/database.schema.js'
import {
  createReservationInput,
  INITIAL_NUMBER,
  testWithPostgres,
  type FiscalSequenceFixture,
  withFiscalSequenceFixture,
} from './fiscal-sequence-integration.fixture.js'

testWithPostgres(
  'rejects divergent intent for one concurrent key and rolls back the losing increment',
  async () => {
    await withFiscalSequenceFixture(async (fixture) => {
      const reservationKey = 'divergent-concurrent-key'
      const results = await Promise.allSettled([
        fixture.reservationPort.reserve(
          createReservationInput({ companyId: fixture.companyId, reservationKey }),
        ),
        fixture.reservationPort.reserve(
          createReservationInput({
            companyId: fixture.companyId,
            environment: 'production',
            reservationKey,
          }),
        ),
      ])
      const fulfilled = results.filter(isFulfilled)
      const rejected = results.filter(isRejected)

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expectConflict(rejected[0]?.reason)
      expect(await findReservationCount({ fixture, reservationKey })).toBe(1)
      const winner = fulfilled[0]
      if (winner === undefined) throw new Error('Synthetic reservation winner is missing')
      await expectOnlyWinnerIncremented({
        fixture,
        winningSequenceId: winner.value.sequenceId,
      })
    })
  },
  30_000,
)

testWithPostgres(
  'rolls back a failed ledger insert and reserves the correct number on retry',
  async () => {
    await withFiscalSequenceFixture(async (fixture) => {
      const input = createReservationInput({
        companyId: fixture.companyId,
        reservationKey: 'synthetic-ledger-failure',
      })
      await installFailingLedgerTrigger(fixture)

      await expect(fixture.reservationPort.reserve(input)).rejects.toThrow()
      expect(await readSequenceNumbers(fixture)).toEqual({
        lastReservedNumber: null,
        nextNumber: INITIAL_NUMBER,
      })
      expect(await findReservationCount({ fixture, reservationKey: input.reservationKey })).toBe(0)

      await removeFailingLedgerTrigger(fixture)
      const retry = await fixture.reservationPort.reserve(input)
      expect(retry).toMatchObject({ isReplay: false, number: INITIAL_NUMBER })
      expect(await findReservationCount({ fixture, reservationKey: input.reservationKey })).toBe(1)
    })
  },
  30_000,
)

function isFulfilled<TResult>(
  result: PromiseSettledResult<TResult>,
): result is PromiseFulfilledResult<TResult> {
  return result.status === 'fulfilled'
}

function isRejected(result: PromiseSettledResult<unknown>): result is PromiseRejectedResult {
  return result.status === 'rejected'
}

function expectConflict(reason: unknown): void {
  expect(reason).toBeInstanceOf(Error)
  expect(reason).toMatchObject({
    code: 'FISCAL_SEQUENCE_RESERVATION_CONFLICT',
    message: 'Fiscal sequence reservation conflicts with an existing key',
    status: 409,
  })
}

type ExpectOnlyWinnerIncrementedParams = {
  readonly fixture: FiscalSequenceFixture
  readonly winningSequenceId: string
}

async function expectOnlyWinnerIncremented(
  input: ExpectOnlyWinnerIncrementedParams,
): Promise<void> {
  const sequences = await input.fixture.database.db
    .select({
      id: fiscalSequences.id,
      lastReservedNumber: fiscalSequences.lastReservedNumber,
      nextNumber: fiscalSequences.nextNumber,
    })
    .from(fiscalSequences)
    .where(eq(fiscalSequences.companyId, input.fixture.companyId))
  const incremented = sequences.filter(({ nextNumber }) => nextNumber === INITIAL_NUMBER + 1n)
  const untouched = sequences.filter(({ nextNumber }) => nextNumber === INITIAL_NUMBER)
  expect(incremented).toEqual([
    {
      id: input.winningSequenceId,
      lastReservedNumber: INITIAL_NUMBER,
      nextNumber: INITIAL_NUMBER + 1n,
    },
  ])
  expect(untouched).toHaveLength(2)
}

async function readSequenceNumbers(
  fixture: FiscalSequenceFixture,
): Promise<{ readonly lastReservedNumber: bigint | null; readonly nextNumber: bigint }> {
  const [sequence] = await fixture.database.db
    .select({
      lastReservedNumber: fiscalSequences.lastReservedNumber,
      nextNumber: fiscalSequences.nextNumber,
    })
    .from(fiscalSequences)
    .where(
      and(
        eq(fiscalSequences.companyId, fixture.companyId),
        eq(fiscalSequences.environment, 'homologation'),
        eq(fiscalSequences.series, 1n),
      ),
    )
  if (sequence === undefined) throw new Error('Synthetic fiscal sequence is missing')
  return sequence
}

type FindReservationCountParams = {
  readonly fixture: FiscalSequenceFixture
  readonly reservationKey: string
}

async function findReservationCount(input: FindReservationCountParams): Promise<number> {
  const reservations = await input.fixture.database.db
    .select({ id: fiscalSequenceReservations.id })
    .from(fiscalSequenceReservations)
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.fixture.companyId),
        eq(fiscalSequenceReservations.reservationKey, input.reservationKey),
      ),
    )
  return reservations.length
}

async function installFailingLedgerTrigger(fixture: FiscalSequenceFixture): Promise<void> {
  await fixture.database.db.execute(sql`
    create function reject_synthetic_ledger_failure() returns trigger
    language plpgsql as $$
    begin
      if new.reservation_key = 'synthetic-ledger-failure' then
        raise exception 'synthetic ledger failure';
      end if;
      return new;
    end;
    $$
  `)
  await fixture.database.db.execute(sql`
    create trigger reject_synthetic_ledger_failure_trigger
    before insert on fiscal_sequence_reservations
    for each row execute function reject_synthetic_ledger_failure()
  `)
}

async function removeFailingLedgerTrigger(fixture: FiscalSequenceFixture): Promise<void> {
  await fixture.database.db.execute(sql`
    drop trigger reject_synthetic_ledger_failure_trigger on fiscal_sequence_reservations
  `)
  await fixture.database.db.execute(sql`drop function reject_synthetic_ledger_failure()`)
}
