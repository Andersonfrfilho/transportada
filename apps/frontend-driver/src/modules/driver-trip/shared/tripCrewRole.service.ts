/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, TripCrewRole } from './driverTrip.types'

export function resolveTripCrewRole(trip: Pick<DriverTrip, 'crewRole'>): TripCrewRole {
  return trip.crewRole ?? 'driver'
}

/** Spec 239 D4: a API recusa (`trip.report`) o toque de campo do ajudante — a tela nem o oferece. */
export function canReportOnTrip(trip: Pick<DriverTrip, 'crewRole'>): boolean {
  return resolveTripCrewRole(trip) === 'driver'
}
