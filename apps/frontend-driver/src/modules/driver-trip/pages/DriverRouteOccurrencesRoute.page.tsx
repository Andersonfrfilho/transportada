/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  parseDriverOccurrenceListFilter,
  parseDriverOccurrenceRoute,
} from '@/modules/shared/driverRoute.service'

import { useDriverLocationKey } from '../hooks/useDriverLocationKey.hook'
import type { RouteOccurrenceView } from '../hooks/useRouteOccurrenceEntries.hook'
import type { DriverTripStop } from '../shared/driverTrip.types'
import { DriverOccurrenceDetailContainer } from './DriverOccurrenceDetailContainer.page'
import { DriverRouteOccurrencesPage } from './DriverRouteOccurrences.page'

type DriverRouteOccurrencesRouteProps = Readonly<{
  isOffline: boolean
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

/** Spec 266: `/ocorrencias` é a lista (o filtro vem de `?nota=`/`?parada=`); `/ocorrencias/:kind/:id` é o detalhe. */
export function DriverRouteOccurrencesRoute({
  isOffline,
  stops,
  view,
}: DriverRouteOccurrencesRouteProps) {
  const locationKey = useDriverLocationKey()
  const queryStart = locationKey.indexOf('?')
  const pathname = queryStart === -1 ? locationKey : locationKey.slice(0, queryStart)
  const search = queryStart === -1 ? '' : locationKey.slice(queryStart)
  const detailRoute = parseDriverOccurrenceRoute(pathname)
  if (detailRoute !== undefined) {
    return (
      <DriverOccurrenceDetailContainer
        isOffline={isOffline}
        route={detailRoute}
        stops={stops}
        view={view}
      />
    )
  }
  return (
    <DriverRouteOccurrencesPage
      isOffline={isOffline}
      scope={parseDriverOccurrenceListFilter(search)}
      stops={stops}
      view={view}
    />
  )
}
