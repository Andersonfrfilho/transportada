/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FiscalNumberReservation,
  FiscalSequenceReservationPort,
  ReserveFiscalNumberInput,
} from '../application/fiscal-sequence-reservation.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'
import {
  recoverFiscalNumberReservation,
  reserveFiscalNumber,
} from './drizzle-fiscal-sequence-reservation-persistence.service.js'

const IDEMPOTENCY_CONSTRAINT = 'fiscal_sequence_reservations_company_id_reservation_key_unique'

export class DrizzleFiscalSequenceReservationRepository implements FiscalSequenceReservationPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async reserve(input: ReserveFiscalNumberInput): Promise<FiscalNumberReservation> {
    try {
      return await this.database.transaction((transaction) =>
        reserveFiscalNumber({ intention: input, transaction }),
      )
    } catch (error) {
      if (!isIdempotencyRace(error)) throw error
      return await this.database.transaction((transaction) =>
        recoverFiscalNumberReservation({ intention: input, transaction }),
      )
    }
  }
}

type PostgresErrorDetails = {
  readonly constraint: string | undefined
  readonly sqlState: string | undefined
}

function isIdempotencyRace(error: unknown): boolean {
  const details = findPostgresError({ error })
  return details?.constraint === IDEMPOTENCY_CONSTRAINT && details.sqlState === '23505'
}

function findPostgresError(input: {
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
  const sqlState =
    typeof candidate.errno === 'string'
      ? candidate.errno
      : typeof candidate.code === 'string'
        ? candidate.code
        : undefined
  if (typeof candidate.constraint === 'string') {
    return { constraint: candidate.constraint, sqlState }
  }
  const causedBy = findPostgresError({ depth: depth + 1, error: candidate.cause })
  return causedBy ?? (sqlState === undefined ? null : { constraint: undefined, sqlState })
}
