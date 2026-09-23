/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P1: a receita lançada à mão na viagem — ajuda de carga, taxa de reentrega, diária
 * cobrada do embarcador. Espelha `list-trip-costs.use-case.ts`.
 */
import { TripNotFoundError } from '../domain/trip.error.js'

export type TripRevenueEntryActor = {
  readonly name: string
  readonly userId: string
}

export type TripRevenueEntryView = {
  readonly actor: TripRevenueEntryActor
  readonly amount: string
  readonly createdAt: string
  readonly description: string
  readonly entryKind: { readonly id: string; readonly name: string }
  readonly id: string
}

export type TripRevenueListPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripRevenueEntryView[] | null>
}

export type ListTripRevenuesInput = {
  readonly companyId: string
  readonly repository: TripRevenueListPort
  readonly tripId: string
}

export async function listTripRevenues(
  input: ListTripRevenuesInput,
): Promise<readonly TripRevenueEntryView[]> {
  const entries = await input.repository.listByTrip(input)
  if (entries === null) throw new TripNotFoundError()

  return entries
}
