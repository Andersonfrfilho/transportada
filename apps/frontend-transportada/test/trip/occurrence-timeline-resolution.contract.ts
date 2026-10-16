/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  describeOccurrenceTimelineEvent,
  filterOccurrenceTimelineEvents,
  OCCURRENCE_TIMELINE_ACTOR_TONE,
  type OccurrenceTimelineEvent,
} from '@/modules/trip/shared/tripOccurrenceTimeline.service'

const BASE = {
  id: 'resolution:1',
  isKey: true,
  occurredAt: '2026-10-15T10:00:00.000Z',
  sincePreviousSeconds: 60,
} as const
const RESOLVED_BY_OFFICE: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'operation', name: 'Operadora Lima' },
  kind: 'resolution.resolved',
  note: 'Cliente confirmou o recebimento.',
}
const RESOLVED_BY_SYSTEM: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'system', name: null },
  kind: 'resolution.resolved',
  note: null,
}
const REOPENED: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'driver', name: 'Motorista Alves' },
  kind: 'resolution.reopened',
}
const TIMINGS = {
  contractorAskedAt: null,
  contractorRepliedAt: null,
  driverReleasedAt: null,
  openSince: null,
  openUntil: null,
} as const

function readTimeline(events: readonly unknown[]) {
  return createTripOccurrenceFeedClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data: { events, timings: TIMINGS } })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  }).readOccurrenceTimeline({ occurrenceId: 'occurrence-1' })
}

describe('spec 266 T3.3: linha do tempo da resolução', () => {
  test('resolvida pela operação diz quem e a observação', () => {
    expect(describeOccurrenceTimelineEvent(RESOLVED_BY_OFFICE)).toEqual({
      key: 'occurrenceTimeline.event.resolvedInternal',
      values: { name: 'Operadora Lima', note: 'Cliente confirmou o recebimento.' },
    })
  })

  test('resolvida pelo sistema usa a frase automática', () => {
    expect(describeOccurrenceTimelineEvent(RESOLVED_BY_SYSTEM)).toEqual({
      key: 'occurrenceTimeline.event.resolvedAutomatic',
      values: {},
    })
  })

  test('reaberta diz o motorista', () => {
    expect(describeOccurrenceTimelineEvent(REOPENED)).toEqual({
      key: 'occurrenceTimeline.event.reopened',
      values: { name: 'Motorista Alves' },
    })
  })

  test('reaberta é do motorista: cor e filtro', () => {
    expect(OCCURRENCE_TIMELINE_ACTOR_TONE[REOPENED.actor.kind]).toBe('driver')
    expect(filterOccurrenceTimelineEvents([RESOLVED_BY_OFFICE, REOPENED], 'driver')).toEqual([
      REOPENED,
    ])
  })

  test('os dois tipos agora são conhecidos e chegam pelo cliente; tipo desconhecido segue descartado', async () => {
    const timeline = await readTimeline([
      { ...RESOLVED_BY_OFFICE, id: 'a' },
      { ...RESOLVED_BY_SYSTEM, id: 'b' },
      { ...REOPENED, id: 'c' },
      { ...REOPENED, id: 'd', kind: 'resolution.something-new' },
    ])
    expect(timeline.events.map((event) => event.id)).toEqual(['a', 'b', 'c'])
  })

  test('resolved sem a nota (campo ausente) reprova a resposta, como os demais eventos estritos', async () => {
    const withoutNote = { ...RESOLVED_BY_OFFICE, note: undefined }
    expect(await readTimeline([withoutNote]).catch(() => 'rejected')).toBe('rejected')
  })

  test.each(['trip.locale.json', 'trip.en.locale.json'])('%s tem as três frases', (file) => {
    const locale = JSON.parse(
      readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
    ) as { occurrenceTimeline: { event: Record<string, string> } }
    const { event } = locale.occurrenceTimeline
    expect(event.resolvedInternal).toContain('{{name}}')
    expect(event.resolvedInternal).toContain('{{note}}')
    expect(event.resolvedAutomatic).toBeString()
    expect(event.reopened).toContain('{{name}}')
  })
})
