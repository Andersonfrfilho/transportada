/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

export const TRIPS_ROUTE = '/trips'
export const TRIP_ROUTE_PREFIX = '/trips/'
export const TRIP_WORKSPACE = 'trip'

/**
 * A montagem de viagem só existe dentro da tela de viagens, e a seleção de notas mora na tela de
 * NF-e: os ids viajam na query string para que o `pathname` continue `/trips` e
 * `resolveCurrentWorkspace` não mude de comportamento — mesmo molde de `fleetRoute.service.ts`.
 */
export const TRIP_CREATION_DOCUMENTS_PARAMETER = 'createFromDocuments'

const DOCUMENT_ID_SEPARATOR = ','

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

export function buildTripCreationRoute(documentIds: readonly string[]): string {
  const value = documentIds.filter((documentId) => documentId !== '').join(DOCUMENT_ID_SEPARATOR)
  if (value === '') return TRIPS_ROUTE
  const query = new URLSearchParams({ [TRIP_CREATION_DOCUMENTS_PARAMETER]: value })
  return `${TRIPS_ROUTE}?${query.toString()}`
}

/** Notas que a seleção da tela de NF-e mandou para a montagem — lista vazia quando não veio nenhuma. */
export function parseTripCreationDocumentIds(search: string): readonly string[] {
  const value = new URLSearchParams(search).get(TRIP_CREATION_DOCUMENTS_PARAMETER)
  if (value === null) return []
  return value.split(DOCUMENT_ID_SEPARATOR).filter((documentId) => documentId !== '')
}

export function navigateToTripCreation(
  input: Readonly<{ documentIds: readonly string[]; navigator: WorkspaceNavigator }>,
): void {
  input.navigator.pushPath(buildTripCreationRoute(input.documentIds))
  input.navigator.rememberWorkspace(TRIP_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToTrips(navigator: WorkspaceNavigator): void {
  navigator.pushPath(TRIPS_ROUTE)
  navigator.rememberWorkspace(TRIP_WORKSPACE)
  navigator.dispatchPopState()
}
