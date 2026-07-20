/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type ReserveFiscalNumberInput = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly model: 'cte'
  readonly reservationKey: string
  readonly series: bigint
}

export type FiscalNumberReservation = {
  readonly isReplay: boolean
  readonly number: bigint
  readonly sequenceId: string
}

export type FiscalSequenceReservationPort = {
  reserve(input: ReserveFiscalNumberInput): Promise<FiscalNumberReservation>
}
