/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, sql } from 'drizzle-orm'

import { fiscalSequenceReservations, fiscalSequences } from '../../database/database.schema.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  FiscalNumberReservation,
  ReserveFiscalNumberInput,
} from '../application/fiscal-sequence-reservation.port.js'
import type { CompanySettingsTransaction } from './drizzle-company-settings.types.js'

type ReservationRecord = {
  readonly environment: 'homologation' | 'production'
  readonly model: 'cte'
  readonly number: bigint
  readonly sequenceId: string
  readonly series: bigint
}

export async function reserveFiscalNumber(input: {
  readonly intention: ReserveFiscalNumberInput
  readonly transaction: CompanySettingsTransaction
}): Promise<FiscalNumberReservation> {
  const existing = await findReservation(input)
  if (existing !== null) return replayReservation({ existing, intention: input.intention })
  const reservation = await incrementSequence(input)
  await input.transaction.insert(fiscalSequenceReservations).values({
    companyId: input.intention.companyId,
    fiscalSequenceId: reservation.sequenceId,
    number: reservation.number,
    reservationKey: input.intention.reservationKey,
  })
  return { ...reservation, isReplay: false }
}

export async function recoverFiscalNumberReservation(input: {
  readonly intention: ReserveFiscalNumberInput
  readonly transaction: CompanySettingsTransaction
}): Promise<FiscalNumberReservation> {
  const existing = await findReservation(input)
  if (existing === null) throw createReservationConflict()
  return replayReservation({ existing, intention: input.intention })
}

async function findReservation(input: {
  readonly intention: ReserveFiscalNumberInput
  readonly transaction: CompanySettingsTransaction
}): Promise<ReservationRecord | null> {
  const [record] = await input.transaction
    .select({
      environment: fiscalSequences.environment,
      model: fiscalSequences.model,
      number: fiscalSequenceReservations.number,
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
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.intention.companyId),
        eq(fiscalSequenceReservations.reservationKey, input.intention.reservationKey),
      ),
    )
    .limit(1)
  return record ?? null
}

async function incrementSequence(input: {
  readonly intention: ReserveFiscalNumberInput
  readonly transaction: CompanySettingsTransaction
}): Promise<Omit<FiscalNumberReservation, 'isReplay'>> {
  const [sequence] = await input.transaction
    .update(fiscalSequences)
    .set({
      lastReservedNumber: sql`${fiscalSequences.nextNumber}`,
      nextNumber: sql`${fiscalSequences.nextNumber} + 1`,
      updatedAt: sql`now()`,
      version: sql`${fiscalSequences.version} + 1`,
    })
    .where(
      and(
        eq(fiscalSequences.companyId, input.intention.companyId),
        eq(fiscalSequences.environment, input.intention.environment),
        eq(fiscalSequences.model, input.intention.model),
        eq(fiscalSequences.series, input.intention.series),
      ),
    )
    .returning({
      number: fiscalSequences.lastReservedNumber,
      sequenceId: fiscalSequences.id,
    })
  if (sequence?.number === null || sequence === undefined) {
    throw createReservationConflict()
  }
  return { number: sequence.number, sequenceId: sequence.sequenceId }
}

function replayReservation(input: {
  readonly existing: ReservationRecord
  readonly intention: ReserveFiscalNumberInput
}): FiscalNumberReservation {
  if (!matchesIntention(input)) throw createReservationConflict()
  return {
    isReplay: true,
    number: input.existing.number,
    sequenceId: input.existing.sequenceId,
  }
}

function matchesIntention(input: {
  readonly existing: ReservationRecord
  readonly intention: ReserveFiscalNumberInput
}): boolean {
  return (
    input.existing.environment === input.intention.environment &&
    input.existing.model === input.intention.model &&
    input.existing.series === input.intention.series
  )
}

function createReservationConflict(): ApiError {
  return new ApiError({
    code: 'FISCAL_SEQUENCE_RESERVATION_CONFLICT',
    message: 'Fiscal sequence reservation conflicts with an existing key',
    status: 409,
  })
}
