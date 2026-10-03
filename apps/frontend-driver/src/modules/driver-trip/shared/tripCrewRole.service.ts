/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, TripCrewRole } from './driverTrip.types'

/** Sem o campo (snapshot anterior à spec 239) a viagem é de quem dirige. */
export const DEFAULT_TRIP_CREW_ROLE: TripCrewRole = 'driver'

export function resolveTripCrewRole(trip: Pick<DriverTrip, 'crewRole'>): TripCrewRole {
  return trip.crewRole ?? DEFAULT_TRIP_CREW_ROLE
}

/** Spec 239 D4: a API recusa (`trip.report`) o toque de campo do ajudante — a tela nem o oferece. */
export function canReportOnTrip(trip: Pick<DriverTrip, 'crewRole'>): boolean {
  return resolveTripCrewRole(trip) === DEFAULT_TRIP_CREW_ROLE
}
