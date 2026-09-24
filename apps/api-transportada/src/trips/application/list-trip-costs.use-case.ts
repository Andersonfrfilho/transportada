/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripCostEntryKind } from '../../database/trip-financial.schema.js'
import { TripNotFoundError } from '../domain/trip.error.js'

export type TripCostEntryActor = {
  readonly name: string
  readonly userId: string
}

export type TripCostEntryView = {
  readonly actor: TripCostEntryActor
  readonly amount: string
  readonly createdAt: string
  readonly description: string
  /** Spec 169 RF5: `null` para lançamento antigo, feito antes do cadastro de espécies existir. */
  readonly entryKind: { readonly id: string; readonly name: string } | null
  readonly id: string
  readonly kind: TripCostEntryKind
}

export type TripCostListPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripCostEntryView[] | null>
}

export type ListTripCostsInput = {
  readonly companyId: string
  readonly repository: TripCostListPort
  readonly tripId: string
}

export async function listTripCosts(
  input: ListTripCostsInput,
): Promise<readonly TripCostEntryView[]> {
  const entries = await input.repository.listByTrip(input)
  if (entries === null) throw new TripNotFoundError()

  return entries
}
