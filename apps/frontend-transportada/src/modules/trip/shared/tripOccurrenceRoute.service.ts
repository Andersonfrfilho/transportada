/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

/**
 * Spec 183 P1: `/ocorrencias/:id`. O app não tem router — `main.tsx` decide a página pelo
 * `pathname` —, então a rota é um par montar/ler, no mesmo molde de `tripRoute.service.ts`.
 */
export const TRIP_OCCURRENCES_ROUTE = '/ocorrencias'
const TRIP_OCCURRENCE_ROUTE_PREFIX = `${TRIP_OCCURRENCES_ROUTE}/`
const TRIP_OCCURRENCES_WORKSPACE = 'trip-occurrences'

export function buildTripOccurrenceRoute(occurrenceId: string): string {
  return `${TRIP_OCCURRENCE_ROUTE_PREFIX}${encodeURIComponent(occurrenceId)}`
}

/** Devolve a ocorrência da rota, ou `null` quando o caminho é outro — inclusive a própria lista. */
export function parseTripOccurrenceRoute(pathname: string): null | string {
  if (!pathname.startsWith(TRIP_OCCURRENCE_ROUTE_PREFIX)) return null
  const remainder = pathname.slice(TRIP_OCCURRENCE_ROUTE_PREFIX.length).replace(/\/$/, '')
  if (remainder === '' || remainder.includes('/')) return null
  return decodeURIComponent(remainder)
}

export function navigateToTripOccurrence(
  input: Readonly<{ navigator: WorkspaceNavigator; occurrenceId: string }>,
): void {
  input.navigator.pushPath(buildTripOccurrenceRoute(input.occurrenceId))
  input.navigator.rememberWorkspace(TRIP_OCCURRENCES_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToTripOccurrences(navigator: WorkspaceNavigator): void {
  navigator.pushPath(TRIP_OCCURRENCES_ROUTE)
  navigator.rememberWorkspace(TRIP_OCCURRENCES_WORKSPACE)
  navigator.dispatchPopState()
}
