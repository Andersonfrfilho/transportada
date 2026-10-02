/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 D9: quanto o caminhão ficou parado em cada parada, para o rateio do tempo.
 *
 * ⚠️ `departed` é a saída **para** a parada (ADR-0088 §1): o evento mora na parada de **destino**, e
 * `arrived − departed` da mesma parada é o trajeto. Por isso a saída de uma parada é o primeiro
 * `departed` de **outra** parada depois da chegada nela — `departed − arrived` da própria parada seria
 * negativo, e o tempo de espera sairia sempre zero sem acusar nada.
 *
 * A espera só é `measured` com o `departed` de outra parada e os **dois extremos** do `driver_app` no
 * **mesmo relógio** (ADR-0088 §6): subtrair o instante do aparelho do que o escritório digitou, ou do
 * que o servidor carimbou, inflaria ou zeraria a espera. Sem `departed` para a parada seguinte, a espera
 * para na chegada ou na entrega nela — senão engoliria o trajeto e a espera da próxima parada, o mesmo
 * minuto contado duas vezes —, e sai `proxy`.
 */
import { DWELL_BASES } from './document-cost-apportionment.types.js'
import type { ApportionmentStop } from './document-cost-apportionment.types.js'
import { TRIP_FIELD_CHANNELS } from './trip-field-channel.constant.js'

export const STOP_DWELL_EVENT_KINDS = {
  arrived: 'arrived',
  delivered: 'delivered',
  departed: 'departed',
  departureCancelled: 'departure_cancelled',
} as const

export type StopDwellEventKind =
  (typeof STOP_DWELL_EVENT_KINDS)[keyof typeof STOP_DWELL_EVENT_KINDS]

/** De qual relógio vem o instante do evento: a hora do toque no aparelho, ou a do servidor. */
export const EVENT_CLOCKS = { device: 'device', server: 'server' } as const

export type EventClock = (typeof EVENT_CLOCKS)[keyof typeof EVENT_CLOCKS]

export type StopDwellEvent = {
  /** `null` quando o evento é anterior à coluna. Só `driver_app` mede espera (ADR-0088 §6). */
  readonly channel: null | string
  readonly clock: EventClock
  readonly kind: StopDwellEventKind
  readonly occurredAt: Date
  readonly stopId: string
}

export type ResolveStopDwellsParams = {
  readonly events: readonly StopDwellEvent[]
  /** Na ordem da rota. */
  readonly stopIds: readonly string[]
}

const MILLISECONDS_PER_SECOND = 1000

export function resolveStopDwells(params: ResolveStopDwellsParams): readonly ApportionmentStop[] {
  const departures = effectiveDepartures(params.events)

  return params.stopIds.map((stopId) => {
    const own = params.events.filter((event) => event.stopId === stopId)
    const arrival = earliest(own, STOP_DWELL_EVENT_KINDS.arrived)
    if (arrival === undefined) return unknownDwell(stopId)

    const exit = firstExitAfter({ arrival, departures, events: params.events })
    if (exit !== undefined) {
      const isMeasured =
        exit.kind === STOP_DWELL_EVENT_KINDS.departed && areComparable(arrival, exit)
      return dwellOf({
        arrival,
        basis: isMeasured ? DWELL_BASES.measured : DWELL_BASES.proxy,
        exit,
      })
    }

    const lastDelivered = latest(own, STOP_DWELL_EVENT_KINDS.delivered)
    if (lastDelivered !== undefined && lastDelivered.occurredAt >= arrival.occurredAt) {
      return dwellOf({ arrival, basis: DWELL_BASES.proxy, exit: lastDelivered })
    }

    return unknownDwell(stopId)
  })
}

/**
 * Onde a espera acaba: o que vier primeiro entre o `departed` de outra parada (a saída de verdade) e a
 * chegada ou entrega em outra parada (prova de que o caminhão já saiu, quando a saída não foi
 * registrada). No empate de instante o `departed` vence.
 */
function firstExitAfter(input: {
  readonly arrival: StopDwellEvent
  readonly departures: readonly StopDwellEvent[]
  readonly events: readonly StopDwellEvent[]
}): StopDwellEvent | undefined {
  const { arrival, departures, events } = input
  const departedElsewhere = departures.filter(
    (departure) =>
      departure.stopId !== arrival.stopId && departure.occurredAt >= arrival.occurredAt,
  )
  const reachedElsewhere = events.filter(
    (event) =>
      event.stopId !== arrival.stopId &&
      (event.kind === STOP_DWELL_EVENT_KINDS.arrived ||
        event.kind === STOP_DWELL_EVENT_KINDS.delivered) &&
      event.occurredAt > arrival.occurredAt,
  )

  return [...departedElsewhere, ...reachedElsewhere].sort(
    (left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() || rank(left) - rank(right),
  )[0]
}

function areComparable(arrival: StopDwellEvent, exit: StopDwellEvent): boolean {
  return (
    arrival.channel === TRIP_FIELD_CHANNELS.driverApp &&
    exit.channel === TRIP_FIELD_CHANNELS.driverApp &&
    arrival.clock === exit.clock
  )
}

/**
 * A saída desfeita não conta (ADR-0088 §2b): o cancelamento carrega o mesmo carimbo do `departed`, então
 * no empate o `departed` vem primeiro e o cancelamento o retira.
 */
function effectiveDepartures(events: readonly StopDwellEvent[]): StopDwellEvent[] {
  const relevant = events
    .filter(
      (event) =>
        event.kind === STOP_DWELL_EVENT_KINDS.departed ||
        event.kind === STOP_DWELL_EVENT_KINDS.departureCancelled,
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() || rank(left) - rank(right),
    )

  const departures: StopDwellEvent[] = []
  for (const event of relevant) {
    if (event.kind === STOP_DWELL_EVENT_KINDS.departed) {
      departures.push(event)
      continue
    }
    const index = departures.findLastIndex((departure) => departure.stopId === event.stopId)
    if (index >= 0) departures.splice(index, 1)
  }

  return departures.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
}

function rank(event: StopDwellEvent): number {
  return event.kind === STOP_DWELL_EVENT_KINDS.departed ? 0 : 1
}

function earliest(
  events: readonly StopDwellEvent[],
  kind: StopDwellEventKind,
): StopDwellEvent | undefined {
  return pick(events, kind, (candidate, current) => candidate < current)
}

function latest(
  events: readonly StopDwellEvent[],
  kind: StopDwellEventKind,
): StopDwellEvent | undefined {
  return pick(events, kind, (candidate, current) => candidate > current)
}

function pick(
  events: readonly StopDwellEvent[],
  kind: StopDwellEventKind,
  isBetter: (candidate: Date, current: Date) => boolean,
): StopDwellEvent | undefined {
  return events
    .filter((event) => event.kind === kind)
    .reduce<
      StopDwellEvent | undefined
    >((picked, event) => (picked === undefined || isBetter(event.occurredAt, picked.occurredAt) ? event : picked), undefined)
}

function dwellOf(input: {
  readonly arrival: StopDwellEvent
  readonly basis: ApportionmentStop['dwellBasis']
  readonly exit: StopDwellEvent
}): ApportionmentStop {
  return {
    dwellBasis: input.basis,
    dwellSeconds: Math.floor(
      (input.exit.occurredAt.getTime() - input.arrival.occurredAt.getTime()) /
        MILLISECONDS_PER_SECOND,
    ),
    id: input.arrival.stopId,
  }
}

function unknownDwell(stopId: string): ApportionmentStop {
  return { dwellBasis: DWELL_BASES.unknown, dwellSeconds: 0, id: stopId }
}
