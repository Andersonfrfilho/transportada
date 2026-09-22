/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'

export type FieldTripCrewDriver = { readonly driverId: string; readonly position: number }

export type FieldTripCrew = {
  readonly drivers: readonly FieldTripCrewDriver[]
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type FieldTripTargetPort = {
  /** `null`: a viagem não existe **nesta empresa**. É 404, nunca 403 (ADR-0067 §2, isolamento). */
  findTripCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FieldTripCrew | null>
}
