/* Copyright (c) 2026 Ada Technology. MIT License. */
import { parseDriverOccurrenceListFilter } from '@/modules/shared/driverRoute.service'

import { useDriverLocationKey } from '../hooks/useDriverLocationKey.hook'
import type { RouteOccurrenceView } from '../hooks/useRouteOccurrenceEntries.hook'
import type { DriverTripStop } from '../shared/driverTrip.types'
import { DriverRouteOccurrencesPage } from './DriverRouteOccurrences.page'

type DriverRouteOccurrencesRouteProps = Readonly<{
  isOffline: boolean
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

/** Spec 266: `/ocorrencias` — a rota decide o filtro da lista (`?nota=`, `?parada=`). */
export function DriverRouteOccurrencesRoute({
  isOffline,
  stops,
  view,
}: DriverRouteOccurrencesRouteProps) {
  const locationKey = useDriverLocationKey()
  const search = locationKey.includes('?') ? locationKey.slice(locationKey.indexOf('?')) : ''
  return (
    <DriverRouteOccurrencesPage
      isOffline={isOffline}
      scope={parseDriverOccurrenceListFilter(search)}
      stops={stops}
      view={view}
    />
  )
}
