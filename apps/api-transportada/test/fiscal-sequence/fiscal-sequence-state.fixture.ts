/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq } from 'drizzle-orm'

import { fiscalSequenceReservations, fiscalSequences } from '../../src/database/database.schema.js'
import type { TestDatabase } from './fiscal-sequence-integration.fixture.js'

type SequenceSelection = {
  readonly companyId: string
  readonly database: TestDatabase
  readonly environment?: 'homologation' | 'production'
  readonly series?: bigint
}

export async function readSequenceState(input: SequenceSelection) {
  const [sequence] = await input.database.db
    .select({
      id: fiscalSequences.id,
      lastReservedNumber: fiscalSequences.lastReservedNumber,
      nextNumber: fiscalSequences.nextNumber,
    })
    .from(fiscalSequences)
    .where(
      and(
        eq(fiscalSequences.companyId, input.companyId),
        eq(fiscalSequences.environment, input.environment ?? 'homologation'),
        eq(fiscalSequences.model, 'cte'),
        eq(fiscalSequences.series, input.series ?? 1n),
      ),
    )
  if (sequence === undefined) throw new Error('Synthetic fiscal sequence is missing')
  return sequence
}

export async function readLedgerNumbers(input: SequenceSelection): Promise<readonly bigint[]> {
  const reservations = await input.database.db
    .select({ number: fiscalSequenceReservations.number })
    .from(fiscalSequenceReservations)
    .innerJoin(
      fiscalSequences,
      and(
        eq(fiscalSequences.companyId, fiscalSequenceReservations.companyId),
        eq(fiscalSequences.id, fiscalSequenceReservations.fiscalSequenceId),
      ),
    )
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.companyId),
        eq(fiscalSequences.environment, input.environment ?? 'homologation'),
        eq(fiscalSequences.model, 'cte'),
        eq(fiscalSequences.series, input.series ?? 1n),
      ),
    )
    .orderBy(asc(fiscalSequenceReservations.number))
  return reservations.map(({ number }) => number)
}

export async function readReservationScopes(database: TestDatabase) {
  return await database.db
    .select({
      companyId: fiscalSequenceReservations.companyId,
      environment: fiscalSequences.environment,
      model: fiscalSequences.model,
      number: fiscalSequenceReservations.number,
      reservationKey: fiscalSequenceReservations.reservationKey,
      sequenceId: fiscalSequenceReservations.fiscalSequenceId,
      series: fiscalSequences.series,
    })
    .from(fiscalSequenceReservations)
    .innerJoin(
      fiscalSequences,
      and(
        eq(fiscalSequences.companyId, fiscalSequenceReservations.companyId),
        eq(fiscalSequences.id, fiscalSequenceReservations.fiscalSequenceId),
      ),
    )
    .orderBy(
      asc(fiscalSequenceReservations.companyId),
      asc(fiscalSequenceReservations.reservationKey),
    )
}
