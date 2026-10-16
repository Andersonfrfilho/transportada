/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  RouteOccurrenceServerState,
  RouteOccurrencesQueryData,
} from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import { resolveSelectedTrip } from '@/modules/driver-trip/shared/driverTripSelection.service'

/** Lista fresca ou retrato offline valem igual: sem leitura (ou viagem encerrada) o estado é desconhecido. */
export function buildOccurrenceStateMap(
  data: RouteOccurrencesQueryData | undefined,
): ReadonlyMap<string, RouteOccurrenceServerState> {
  if (data?.status !== 'loaded') return new Map()
  return new Map(data.occurrences.map((occurrence) => [occurrence.id, occurrence.state] as const))
}

/** A mesma viagem que a tela da rota usa, para as duas telas dividirem a consulta (e o retrato offline). */
export function resolveConversationTripId(input: {
  readonly selectedTripId: string | undefined
  readonly trips: readonly DriverTrip[]
}): string | undefined {
  return resolveSelectedTrip(input)?.id
}
