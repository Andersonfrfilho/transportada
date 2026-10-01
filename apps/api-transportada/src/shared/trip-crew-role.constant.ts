/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 / ADR-0065: o ajudante é tripulação, não condutor — só `driver` entra no MDF-e.
 */
export const TRIP_CREW_ROLES = ['driver', 'helper'] as const
export type TripCrewRole = (typeof TRIP_CREW_ROLES)[number]
