/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha do evento na linha do tempo: ícone por tipo e tom pelo desfecho, chips (parada, transição,
 * registro tardio), intervalo para o evento anterior e régua de intervalo grande. Tudo calculado das
 * horas que o payload já traz; o DOM está em `trip-hooks/timeline-event-row.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  TRIP_TIMELINE_KINDS,
  type TripTimelineItem,
} from '../../src/modules/trip/shared/trip.types'
import {
  formatTripTimelineDuration,
  resolveTripTimelineChips,
  resolveTripTimelineIcon,
  resolveTripTimelineInterval,
  TRIP_TIMELINE_GAP_THRESHOLD_MINUTES,
} from '../../src/modules/trip/shared/tripTimelineRow.service'

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'driver_app',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.status_changed',
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

function translate(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key
  const entries = Object.entries(options).map(([name, value]) => `${name}=${String(value)}`)
  return `${key}(${entries.join(',')})`
}

function makeItem(overrides: Partial<TripTimelineItem>): TripTimelineItem {
  return { ...BASE_ITEM, ...overrides }
}

describe('ícone e tom por tipo de evento', () => {
  it('todo tipo de evento tem ícone', () => {
    for (const kind of TRIP_TIMELINE_KINDS) {
      expect(resolveTripTimelineIcon(makeItem({ kind })).icon).toBeString()
    }
  })

  it('entrega é verde, devolução e ocorrência são vermelhas', () => {
    expect(resolveTripTimelineIcon(makeItem({ kind: 'document.delivered' })).tone).toBe('done')
    expect(resolveTripTimelineIcon(makeItem({ kind: 'document.returned' })).tone).toBe('problem')
    expect(resolveTripTimelineIcon(makeItem({ kind: 'stop.occurrence' })).tone).toBe('problem')
    expect(resolveTripTimelineIcon(makeItem({ kind: 'document.occurrence' })).tone).toBe('problem')
  })

  it('o marco (viagem criada, chegada) é neutro e o andamento é cobre', () => {
    expect(resolveTripTimelineIcon(makeItem({ kind: 'trip.created' })).tone).toBe('neutral')
    expect(resolveTripTimelineIcon(makeItem({ kind: 'stop.arrived' })).tone).toBe('neutral')
    expect(
      resolveTripTimelineIcon(makeItem({ kind: 'trip.status_changed', toStatus: 'loading' })).tone,
    ).toBe('progress')
  })

  it('viagem concluída é verde e cancelada é vermelha', () => {
    expect(
      resolveTripTimelineIcon(makeItem({ kind: 'trip.status_changed', toStatus: 'completed' }))
        .tone,
    ).toBe('done')
    expect(
      resolveTripTimelineIcon(makeItem({ kind: 'trip.status_changed', toStatus: 'cancelled' }))
        .tone,
    ).toBe('problem')
  })
})

describe('chips da linha', () => {
  it('sem dado nenhum, nenhum chip', () => {
    expect(resolveTripTimelineChips(makeItem({}), translate)).toEqual([])
  })

  it('a parada vira "Parada N"', () => {
    const chips = resolveTripTimelineChips(
      makeItem({ kind: 'stop.arrived', stop: { id: 's', sequence: 5 } }),
      translate,
    )

    expect(chips).toEqual([
      { id: 'stop', label: 'eventTimeline.chip.stop(sequence=5)', tone: 'neutral' },
    ])
  })

  it('a transição de situação da viagem usa o rótulo de situação', () => {
    const chips = resolveTripTimelineChips(
      makeItem({ fromStatus: 'on_delivery_route', toStatus: 'completed' }),
      translate,
    )

    expect(chips).toEqual([
      {
        id: 'transition',
        label: 'eventTimeline.chip.transition(from=status.on_delivery_route,to=status.completed)',
        tone: 'neutral',
      },
    ])
  })

  it('a transição da nota usa o rótulo de separação', () => {
    const chips = resolveTripTimelineChips(
      makeItem({ fromStatus: 'loaded', kind: 'document.status_changed', toStatus: 'delivered' }),
      translate,
    )

    expect(chips[0]?.label).toInclude('from=separationStatus.loaded')
  })

  it('transição com um dos lados ausente ou desconhecido não vira chip', () => {
    expect(resolveTripTimelineChips(makeItem({ toStatus: 'completed' }), translate)).toEqual([])
    expect(
      resolveTripTimelineChips(makeItem({ fromStatus: 'xyz', toStatus: 'completed' }), translate),
    ).toEqual([])
  })

  it('registro tardio mostra quanto depois, em cobre', () => {
    const chips = resolveTripTimelineChips(
      makeItem({ recordedAt: '2026-09-18T12:25:00.000Z' }),
      translate,
    )

    expect(chips).toEqual([
      {
        id: 'late',
        label:
          'eventTimeline.chip.recordedLater(duration=eventTimeline.duration.minutes(count=25))',
        tone: 'copper',
      },
    ])
  })

  it('baixa registrada depois, sem hora de registro, vira o chip sem duração', () => {
    const chips = resolveTripTimelineChips(makeItem({ lateRegistration: true }), translate)

    expect(chips).toEqual([
      { id: 'late', label: 'eventTimeline.chip.recordedLaterUnknown', tone: 'copper' },
    ])
  })
})

describe('intervalo para o evento anterior', () => {
  const NEWER = makeItem({ occurredAt: '2026-09-18T12:00:00.000Z' })

  function olderBy(minutes: number): TripTimelineItem {
    return makeItem({
      id: 'older',
      occurredAt: new Date(Date.parse(NEWER.occurredAt) - minutes * 60_000).toISOString(),
    })
  }

  it('abaixo de um minuto não diz nada', () => {
    expect(resolveTripTimelineInterval({ newer: NEWER, older: olderBy(0) })).toEqual({
      kind: 'none',
    })
  })

  it('poucos minutos viram "N min após o evento anterior"', () => {
    expect(resolveTripTimelineInterval({ newer: NEWER, older: olderBy(1) })).toEqual({
      kind: 'after',
      minutes: 1,
    })
  })

  it('a partir do limite vira régua de intervalo', () => {
    expect(
      resolveTripTimelineInterval({
        newer: NEWER,
        older: olderBy(TRIP_TIMELINE_GAP_THRESHOLD_MINUTES - 1),
      }).kind,
    ).toBe('after')
    expect(
      resolveTripTimelineInterval({
        newer: NEWER,
        older: olderBy(TRIP_TIMELINE_GAP_THRESHOLD_MINUTES),
      }),
    ).toEqual({ kind: 'gap', minutes: TRIP_TIMELINE_GAP_THRESHOLD_MINUTES })
  })

  it('data inválida ou fora de ordem não inventa intervalo', () => {
    expect(
      resolveTripTimelineInterval({ newer: NEWER, older: makeItem({ occurredAt: 'ontem' }) }),
    ).toEqual({ kind: 'none' })
    expect(resolveTripTimelineInterval({ newer: olderBy(10), older: NEWER })).toEqual({
      kind: 'none',
    })
  })
})

describe('duração por extenso', () => {
  it('minutos, horas redondas e horas com minutos', () => {
    expect(formatTripTimelineDuration(25, translate)).toBe(
      'eventTimeline.duration.minutes(count=25)',
    )
    expect(formatTripTimelineDuration(120, translate)).toBe('eventTimeline.duration.hours(hours=2)')
    expect(formatTripTimelineDuration(445, translate)).toBe(
      'eventTimeline.duration.hoursMinutes(hours=7,minutes=25)',
    )
  })
})

describe('textos e fonte da linha', () => {
  it('cada texto novo existe nos dois idiomas', () => {
    for (const locale of [trip, tripEn]) {
      expect(locale.eventTimeline.chip.stop).toInclude('{{sequence}}')
      expect(locale.eventTimeline.chip.transition).toInclude('{{from}}')
      expect(locale.eventTimeline.chip.recordedLater).toInclude('{{duration}}')
      expect(locale.eventTimeline.chip.recordedLaterUnknown).toBeString()
      expect(locale.eventTimeline.duration.hoursMinutes).toInclude('{{minutes}}')
      expect(locale.eventTimeline.gap).toInclude('{{duration}}')
      expect(locale.eventTimeline.afterPrevious).toInclude('{{duration}}')
    }
    expect(trip.eventTimeline.gap).toBe('{{duration}} sem registro')
  })

  it('o componente usa ícone SVG, horário em fonte monoespaçada e nenhum estilo inline', () => {
    const component = readFileSync(
      new URL('../../src/modules/trip/components/TripTimeline.component.tsx', import.meta.url),
      'utf8',
    )
    const styles = readFileSync(
      new URL('../../src/modules/trip/styles/tripTimeline.module.css', import.meta.url),
      'utf8',
    )

    expect(component).toInclude('<Icon name=')
    expect(component).not.toMatch(/style=\{/u)
    expect(component).not.toInclude('resolveTripTimelineAvatar')
    expect(/\.itemTime\s*\{([^}]*)\}/u.exec(styles)?.[1]).toMatch(/font-family:\s*var\(--font-/u)
    expect(/\.itemTitle\s*\{([^}]*)\}/u.exec(styles)?.[1]).toMatch(/font-weight:\s*600/u)
  })
})
