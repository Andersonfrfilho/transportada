/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceRoute } from '@/modules/shared/driverRoute.service'

import type { RouteOccurrenceView } from '../hooks/useRouteOccurrenceEntries.hook'
import { resolveOccurrenceDetailState } from '../shared/occurrenceDetailState.service'
import type { DriverTripStop } from '../shared/driverTrip.types'
import { useDriverRouteOccurrenceDetail } from '../shared/useDriverRouteOccurrences.query'
import { DriverOccurrenceDetailPage } from './DriverOccurrenceDetail.page'

type DriverOccurrenceDetailContainerProps = Readonly<{
  isOffline: boolean
  route: DriverOccurrenceRoute
  stops: readonly DriverTripStop[]
  view: RouteOccurrenceView
}>

/** Lê o detalhe no servidor — salvo o item ainda na fila, que só existe no aparelho — e entrega à tela o estado resolvido. */
export function DriverOccurrenceDetailContainer({
  isOffline,
  route,
  stops,
  view,
}: DriverOccurrenceDetailContainerProps) {
  const listedEntry = view.entries.find((entry) => entry.id === route.id)
  const isQueued = listedEntry?.source === 'queue'
  const detail = useDriverRouteOccurrenceDetail({
    canSync: !isOffline && !isQueued,
    id: route.id,
    kind: route.kind,
  })
  const isUnreachable = isOffline || detail.isError || detail.fetchStatus === 'paused'

  return (
    <DriverOccurrenceDetailPage
      isUnreachable={isUnreachable}
      state={resolveOccurrenceDetailState({ isUnreachable, listedEntry, result: detail.data })}
      stops={stops}
      view={view}
    />
  )
}
