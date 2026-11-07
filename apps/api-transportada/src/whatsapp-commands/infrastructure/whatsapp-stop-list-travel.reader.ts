/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T2.2 (RF4, D1): a distância e o tempo de cada parada da lista, pela estrada (OSRM `table`, UMA chamada) do
 * mesmo último ponto compartilhado do bloco da parada (294 RF30). Sem ponto nesta viagem: nenhuma chamada, a linha
 * some e `isLocationMissing` pede o rodapé 📎. OSRM fora: a linha some em todas, sem rodapé. Parada sem estrada ou
 * sem coordenada: só ela perde a linha. Nunca lança.
 *
 * ⚠️ Log sem PII: só empresa e motivo.
 */
import type { RouteDistanceTablePort } from '../../trips/application/route-distance-table.port.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import { describeListDistance, describeListDuration } from '../domain/whatsapp-stop-card.policy.js'
import { resolveEtaOrigin, type EtaOrigin } from './whatsapp-stop-card.reader.js'

export type StopListTravel = {
  /** Sem ponto compartilhado nesta viagem: a lista termina pedindo a localização. */
  readonly isLocationMissing: boolean
  readonly byStopId: ReadonlyMap<string, { readonly distance: string; readonly duration: string }>
}

export type WhatsAppStopListTravelReader = {
  read(input: {
    readonly companyId: string
    readonly stops: readonly {
      readonly id: string
      readonly coordinate?: { readonly latitude: number; readonly longitude: number } | undefined
    }[]
    readonly trip: Pick<DriverTrip, 'stops'>
  }): Promise<StopListTravel>
}

export const WHATSAPP_STOP_LIST_TRAVEL_LOG = {
  unavailable: 'whatsapp_stop_list_travel.unavailable',
} as const

export function createWhatsAppStopListTravelReader(dependencies: {
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly readOriginPoint: (input: {
    readonly companyId: string
    readonly origin: EtaOrigin
  }) => Promise<{ readonly latitude: number; readonly longitude: number } | null>
  /** Ausente (sem `ROUTING_MATRIX_URL`), a linha nunca aparece. */
  readonly table?: RouteDistanceTablePort
}): WhatsAppStopListTravelReader {
  const noTravel = (isLocationMissing: boolean): StopListTravel => ({
    byStopId: new Map(),
    isLocationMissing,
  })

  return {
    async read({ companyId, stops, trip }) {
      const [first] = stops
      if (first === undefined) return noTravel(false)
      try {
        const etaOrigin = resolveEtaOrigin(trip, first.id)
        const origin =
          etaOrigin === null
            ? null
            : await dependencies.readOriginPoint({ companyId, origin: etaOrigin })
        if (origin === null) return noTravel(true)
        const located = stops.filter(
          (stop): stop is typeof stop & { coordinate: NonNullable<typeof stop.coordinate> } =>
            stop.coordinate !== undefined,
        )
        const cells =
          located.length === 0 || dependencies.table === undefined
            ? null
            : await dependencies.table.readDistancesFrom(
                origin,
                located.map((stop) => stop.coordinate),
              )
        if (cells === null) {
          dependencies.logger?.warn(WHATSAPP_STOP_LIST_TRAVEL_LOG.unavailable, {
            companyId,
            reason: 'routing_unavailable',
          })
          return noTravel(false)
        }
        const byStopId = new Map<string, { distance: string; duration: string }>()
        located.forEach((stop, index) => {
          const cell = cells[index]
          if (cell === null || cell === undefined) return
          byStopId.set(stop.id, {
            distance: describeListDistance(cell.distanceMetres),
            duration: describeListDuration(cell.durationSeconds),
          })
        })
        return { byStopId, isLocationMissing: false }
      } catch (error) {
        dependencies.logger?.warn(WHATSAPP_STOP_LIST_TRAVEL_LOG.unavailable, {
          companyId,
          reason: error instanceof Error ? error.name : typeof error,
        })
        return noTravel(false)
      }
    },
  }
}

/** O leitor da lista pelo motorista: acha a viagem que tem a parada e lê distância e tempo dela; nunca lança. */
export function createDriverStopListTravel(dependencies: {
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly reader: WhatsAppStopListTravelReader
}) {
  return async (input: {
    readonly companyId: string
    readonly driverId: string
    readonly stops: readonly {
      readonly id: string
      readonly coordinate?: { readonly latitude: number; readonly longitude: number } | undefined
    }[]
  }): Promise<StopListTravel | null> => {
    const [first] = input.stops
    if (first === undefined) return null
    try {
      const trips = await dependencies.listActiveTrips(input)
      const trip = trips.find((candidate) => candidate.stops.some((stop) => stop.id === first.id))
      if (trip === undefined) return null
      return await dependencies.reader.read({
        companyId: input.companyId,
        stops: input.stops,
        trip,
      })
    } catch (error) {
      dependencies.logger?.warn(WHATSAPP_STOP_LIST_TRAVEL_LOG.unavailable, {
        companyId: input.companyId,
        reason: error instanceof Error ? error.name : typeof error,
      })
      return null
    }
  }
}
