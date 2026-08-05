/* Copyright (c) 2026 Ada Technology. MIT License. */
export const MDFE_MANIFESTS_ROUTE = '/mdfe-manifests'
export const MDFE_MANIFEST_WORKSPACE = 'mdfe-manifest'

/**
 * A navegação do shell é manual (`main.tsx`) e a viagem de origem viaja na query string: o
 * `pathname` continua `/mdfe-manifests`, então `resolveCurrentWorkspace` não muda de comportamento.
 */
export const MDFE_MANIFEST_TRIP_PARAMETER = 'tripId'

export function buildMdfeManifestRoute(tripId?: string): string {
  if (tripId === undefined || tripId === '') return MDFE_MANIFESTS_ROUTE
  const search = new URLSearchParams({ [MDFE_MANIFEST_TRIP_PARAMETER]: tripId })
  return `${MDFE_MANIFESTS_ROUTE}?${search.toString()}`
}

export function parseMdfeManifestTripParameter(search: string): null | string {
  const tripId = new URLSearchParams(search).get(MDFE_MANIFEST_TRIP_PARAMETER)
  if (tripId === null || tripId === '') return null
  return tripId
}
