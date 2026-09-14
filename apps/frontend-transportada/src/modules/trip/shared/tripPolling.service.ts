/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: quando a tela do escritório repete a consulta sozinha.
 */
import {
  type CargoLayoutPendingEpisode,
  resolveCargoLayoutRefetchInterval,
} from './cargoLayoutPolling.service'
import { isTripOnTheRoad, TRIP_ON_THE_ROAD_REFETCH_MS } from './trip.constant'
import type { CargoLayoutStatus } from './trip.types'

/** Os dois estados em que a nota ainda pode mudar sozinha — o motorista é quem a move daqui. */
const PENDING_STATUSES = new Set(['loaded', 'pending', 'separated'])

export type TripPollingDocument = Readonly<{ separationStatus: string }>

/**
 * ⚠️ **Duas condições, não uma.** A regra da spec 057 P2 olhava só o estado da viagem, e uma viagem
 * `dispatched` com tudo entregue seguia batendo no servidor de meio em meio minuto, para sempre,
 * até alguém fechar a aba — o estado só vira `completed` quando alguém fecha a viagem, e ninguém
 * fecha na hora.
 *
 * Fora da rua não se repete porque quem muda a viagem é quem está olhando a tela, e ele já vê o que
 * fez. Na rua quem muda é o motorista, do outro lado, e é aí que a repetição paga.
 *
 * `false` — não `0`, não `null` — porque é o que o TanStack Query entende como "não repita".
 */
export function resolveTripRefetchInterval(input: {
  /** Spec 145 T12: a planta em cálculo também faz perguntar, mais rápido e com teto próprio. */
  readonly cargoLayout?: Readonly<{
    episode: CargoLayoutPendingEpisode | undefined
    now: number
    status: CargoLayoutStatus | undefined
  }>
  readonly documents: readonly TripPollingDocument[]
  readonly status: string | undefined
}): false | number {
  const tripInterval = resolveOnTheRoadInterval(input)
  const cargoInterval =
    input.cargoLayout === undefined ? false : resolveCargoLayoutRefetchInterval(input.cargoLayout)
  if (cargoInterval === false) return tripInterval
  if (tripInterval === false) return cargoInterval
  return Math.min(tripInterval, cargoInterval)
}

function resolveOnTheRoadInterval(input: {
  readonly documents: readonly TripPollingDocument[]
  readonly status: string | undefined
}): false | number {
  if (!isTripOnTheRoad(input.status)) return false

  const hasPending = input.documents.some((document) =>
    PENDING_STATUSES.has(document.separationStatus),
  )

  return hasPending ? TRIP_ON_THE_ROAD_REFETCH_MS : false
}
