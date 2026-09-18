/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 D10: o recorte da viagem que decide as ações permitidas — estado, paradas, notas e se há
 * motorista. Leitura própria e leve: `GET /trips/:id/allowed-actions` não paga o detalhe inteiro.
 */
import type { AllowedActionsTripSnapshot } from '../domain/trip-allowed-actions.policy.js'
import { TripNotFoundError } from '../domain/trip.error.js'

export type TripActionSnapshotPort = {
  /** `null` quando a viagem não é desta empresa — ausência, nunca 403. */
  readTripActionSnapshot(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<AllowedActionsTripSnapshot | null>
}

export type ReadTripActionSnapshotParams = {
  readonly companyId: string
  readonly repository: TripActionSnapshotPort
  readonly tripId: string
}

export async function readTripActionSnapshot(
  params: ReadTripActionSnapshotParams,
): Promise<AllowedActionsTripSnapshot> {
  const snapshot = await params.repository.readTripActionSnapshot({
    companyId: params.companyId,
    tripId: params.tripId,
  })
  if (snapshot === null) throw new TripNotFoundError()

  return snapshot
}
