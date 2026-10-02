/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 D9: quanto o caminhão ficou parado em cada parada, para o rateio do tempo.
 *
 * ⚠️ `departed` é a saída **para** a parada (ADR-0088 §1): o evento mora na parada de **destino**, e
 * `arrived − departed` da mesma parada é o trajeto. Por isso a saída de uma parada é o primeiro
 * `departed` de **outra** parada depois da chegada nela — `departed − arrived` da própria parada seria
 * negativo, e o tempo de espera sairia sempre zero sem acusar nada.
 */
import { DWELL_BASES } from './document-cost-apportionment.types.js'
import type { ApportionmentStop } from './document-cost-apportionment.types.js'

export const STOP_DWELL_EVENT_KINDS = {
  arrived: 'arrived',
  delivered: 'delivered',
  departed: 'departed',
  departureCancelled: 'departure_cancelled',
} as const

export type StopDwellEventKind =
  (typeof STOP_DWELL_EVENT_KINDS)[keyof typeof STOP_DWELL_EVENT_KINDS]

export type StopDwellEvent = {
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
    const arrivedAt = earliest(own, STOP_DWELL_EVENT_KINDS.arrived)
    if (arrivedAt === undefined) return unknownDwell(stopId)

    const leftAt = departures.find(
      (departure) => departure.stopId !== stopId && departure.at >= arrivedAt,
    )?.at
    if (leftAt !== undefined)
      return dwellOf({ arrivedAt, basis: DWELL_BASES.measured, leftAt, stopId })

    const lastDeliveredAt = latest(own, STOP_DWELL_EVENT_KINDS.delivered)
    if (lastDeliveredAt !== undefined && lastDeliveredAt >= arrivedAt) {
      return dwellOf({ arrivedAt, basis: DWELL_BASES.proxy, leftAt: lastDeliveredAt, stopId })
    }

    return unknownDwell(stopId)
  })
}

/**
 * A saída desfeita não conta (ADR-0088 §2b): o cancelamento carrega o mesmo carimbo do `departed`, então
 * no empate o `departed` vem primeiro e o cancelamento o retira.
 */
function effectiveDepartures(
  events: readonly StopDwellEvent[],
): { readonly at: Date; readonly stopId: string }[] {
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

  const departures: { at: Date; stopId: string }[] = []
  for (const event of relevant) {
    if (event.kind === STOP_DWELL_EVENT_KINDS.departed) {
      departures.push({ at: event.occurredAt, stopId: event.stopId })
      continue
    }
    const index = departures.findLastIndex((departure) => departure.stopId === event.stopId)
    if (index >= 0) departures.splice(index, 1)
  }

  return departures.sort((left, right) => left.at.getTime() - right.at.getTime())
}

function rank(event: StopDwellEvent): number {
  return event.kind === STOP_DWELL_EVENT_KINDS.departed ? 0 : 1
}

function earliest(events: readonly StopDwellEvent[], kind: StopDwellEventKind): Date | undefined {
  return pickTime(events, kind, (candidate, current) => candidate < current)
}

function latest(events: readonly StopDwellEvent[], kind: StopDwellEventKind): Date | undefined {
  return pickTime(events, kind, (candidate, current) => candidate > current)
}

function pickTime(
  events: readonly StopDwellEvent[],
  kind: StopDwellEventKind,
  isBetter: (candidate: Date, current: Date) => boolean,
): Date | undefined {
  return events
    .filter((event) => event.kind === kind)
    .reduce<
      Date | undefined
    >((picked, event) => (picked === undefined || isBetter(event.occurredAt, picked) ? event.occurredAt : picked), undefined)
}

function dwellOf(input: {
  readonly arrivedAt: Date
  readonly basis: ApportionmentStop['dwellBasis']
  readonly leftAt: Date
  readonly stopId: string
}): ApportionmentStop {
  return {
    dwellBasis: input.basis,
    dwellSeconds: Math.floor(
      (input.leftAt.getTime() - input.arrivedAt.getTime()) / MILLISECONDS_PER_SECOND,
    ),
    id: input.stopId,
  }
}

function unknownDwell(stopId: string): ApportionmentStop {
  return { dwellBasis: DWELL_BASES.unknown, dwellSeconds: 0, id: stopId }
}
