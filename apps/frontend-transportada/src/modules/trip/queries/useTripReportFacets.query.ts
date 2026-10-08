/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createTripReportFetchFacets } from '../shared/tripReportClient.service'
import type { TripReportFacets, TripReportFetchFacets } from '../shared/tripReport.types'

const TRIP_REPORT_FACETS_QUERY_KEY = ['trip', 'report-facets'] as const
const FACETS_STALE_TIME_MS = 5 * 60 * 1000

function getDefaultFetchFacets(): TripReportFetchFacets {
  return createTripReportFetchFacets({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useTripReportFacetsQuery(
  input: Readonly<{ fetchFacets?: TripReportFetchFacets }> = {},
): TripReportFacets | undefined {
  const { data } = useQuery<TripReportFacets>({
    queryFn: ({ signal }) => (input.fetchFacets ?? getDefaultFetchFacets())({ signal }),
    queryKey: TRIP_REPORT_FACETS_QUERY_KEY,
    staleTime: FACETS_STALE_TIME_MS,
  })
  return data
}
