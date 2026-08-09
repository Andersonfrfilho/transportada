/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

export const TRIPS_ROUTE = '/trips'
export const TRIP_ROUTE_PREFIX = '/trips/'
export const TRIP_WORKSPACE = 'trip'

export function buildTripRoute(tripId: string): string {
  return `${TRIP_ROUTE_PREFIX}${encodeURIComponent(tripId)}`
}

/** Devolve a viagem da rota, ou `null` quando o caminho é outro — inclusive a própria lista. */
export function parseTripRoute(pathname: string): null | string {
  if (!pathname.startsWith(TRIP_ROUTE_PREFIX)) return null
  const remainder = pathname.slice(TRIP_ROUTE_PREFIX.length).replace(/\/$/, '')
  if (remainder === '' || remainder.includes('/')) return null
  return decodeURIComponent(remainder)
}

export function navigateToTrip(
  input: Readonly<{ navigator: WorkspaceNavigator; tripId: string }>,
): void {
  input.navigator.pushPath(buildTripRoute(input.tripId))
  input.navigator.rememberWorkspace(TRIP_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToTrips(navigator: WorkspaceNavigator): void {
  navigator.pushPath(TRIPS_ROUTE)
  navigator.rememberWorkspace(TRIP_WORKSPACE)
  navigator.dispatchPopState()
}
