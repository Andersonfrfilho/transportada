/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from './driverTrip.types'
import { isConcludedTripStatus } from './tripSnapshot.service'

/**
 * ADR-0075 §8: "em rota" para escolher a viagem padrão. `dispatched` fica de fora de propósito — a
 * carga saiu, mas o motorista ainda não marcou nada, e quem já está entregando é a que importa.
 */
const ON_ROUTE_TRIP_STATUSES: ReadonlySet<string> = new Set(['in_transit', 'on_delivery_route'])

export type ResolveSelectedTripParams = Readonly<{
  selectedTripId: string | undefined
  /** Na ordem da API: `createdAt` ascendente, então a primeira é a mais antiga. */
  trips: readonly DriverTrip[]
}>

/**
 * RF12: a escolha do motorista vale enquanto a viagem continuar na lista. Sem escolha, ou com a
 * escolhida fora da lista (fechou, saiu dele), vale a padrão: a mais antiga em rota, senão a mais
 * antiga de todas. Viagem concluída ou cancelada (spec 225: a API a devolve por 15 min, só para o
 * aviso de reatribuição não confundir conclusão com troca de tripulação) nunca é eleita.
 */
export function resolveSelectedTrip({
  selectedTripId,
  trips,
}: ResolveSelectedTripParams): DriverTrip | undefined {
  const openTrips = trips.filter((trip) => !isConcludedTripStatus(trip.status))
  const chosen = openTrips.find((trip) => trip.id === selectedTripId)
  if (chosen !== undefined) return chosen

  return openTrips.find((trip) => ON_ROUTE_TRIP_STATUSES.has(trip.status)) ?? openTrips[0]
}

export type ResolveTripSwitchParams = Readonly<{
  currentTrip: DriverTrip | undefined
  isCaptureIdle: boolean
  resolvedTrip: DriverTrip | undefined
  selectedTripId: string | undefined
}>

export type TripSwitchDecision = Readonly<{
  /** Só vem preenchido quando a troca aconteceu sem o motorista escolher essa viagem. */
  autoSwitchedTripId: string | undefined
  trip: DriverTrip | undefined
}>

/**
 * Câmera, assinatura e recorte navegam fora do React (Fullscreen API nativa) — trocar a viagem
 * exibida por baixo deles enquanto estão abertos deixa a captura órfã: o "Cancelar" dela chama
 * `setState` de um componente já desmontado, e não faz mais nada. Com captura aberta, a viagem
 * atual continua na tela até a captura fechar; a mesma viagem (`resolvedTrip.id === currentTrip.id`)
 * sempre atualiza, capturas ou não — é só o `trip.status`/documentos mudando, não uma troca.
 */
export function resolveTripSwitch({
  currentTrip,
  isCaptureIdle,
  resolvedTrip,
  selectedTripId,
}: ResolveTripSwitchParams): TripSwitchDecision {
  const isSameTrip = resolvedTrip?.id === currentTrip?.id
  if (!isSameTrip && !isCaptureIdle) {
    return { autoSwitchedTripId: undefined, trip: currentTrip }
  }

  const isAutomaticSwitch =
    !isSameTrip &&
    currentTrip !== undefined &&
    resolvedTrip !== undefined &&
    selectedTripId !== resolvedTrip.id

  return {
    autoSwitchedTripId: isAutomaticSwitch ? resolvedTrip.id : undefined,
    trip: resolvedTrip,
  }
}

const STOP_LABEL_QUALIFIER_SEPARATOR = ' — '

/** O rótulo completo da parada carrega um qualificador depois de " — "; o caminho fica só a rua. */
function shortStopLabel(label: string): string {
  const separatorIndex = label.indexOf(STOP_LABEL_QUALIFIER_SEPARATOR)
  return separatorIndex === -1 ? label : label.slice(0, separatorIndex)
}

export type TripSelectorPathView = Readonly<{
  path: string
  stopCount: number
}>

/**
 * Spec 189 T7.2 (revisão): "Viagem 1 · placa" não dizia para onde a viagem vai, e duas viagens podem
 * ter a mesma placa. Com uma parada só, o caminho é ela mesma; com mais, a primeira parada até a
 * última — o resto do trajeto é implícito na contagem.
 */
export function describeTripSelectorPath(trip: DriverTrip): TripSelectorPathView {
  const [firstStop, ...restStops] = trip.stops
  if (firstStop === undefined) return { path: '', stopCount: 0 }

  const stopCount = restStops.length + 1
  const first = shortStopLabel(firstStop.label)
  if (stopCount === 1) return { path: first, stopCount }

  const lastStop = restStops.at(-1) ?? firstStop
  const last = shortStopLabel(lastStop.label)
  return { path: `${first} → ${last}`, stopCount }
}
