/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  describeOccurrenceTimelineEvent,
  filterOccurrenceTimelineEvents,
  formatOccurrenceElapsed,
  formatOccurrenceGap,
  OCCURRENCE_TIMELINE_ACTOR_TONE,
  resolveOccurrenceTimelineDurations,
  type OccurrenceTimeline,
  type OccurrenceTimelineEvent,
} from '@/modules/trip/shared/tripOccurrenceTimeline.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000d206'

const RECORDED: OccurrenceTimelineEvent = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence.recorded:1',
  isKey: true,
  kind: 'occurrence.recorded',
  occurredAt: '2026-09-24T10:00:00.000Z',
  sincePreviousSeconds: null,
}
const SENT: OccurrenceTimelineEvent = {
  actor: { kind: 'system', name: null },
  deliveryStatus: 'sent',
  id: 'contractor.mail.sent:m1',
  interpretation: null,
  isKey: false,
  kind: 'contractor.mail.sent',
  occurredAt: '2026-09-24T10:05:00.000Z',
  sincePreviousSeconds: 300,
}
const REPLIED: OccurrenceTimelineEvent = {
  actor: { kind: 'contractor', name: null },
  deliveryStatus: null,
  id: 'contractor.mail.received:m2',
  interpretation: 'message',
  isKey: false,
  kind: 'contractor.mail.received',
  occurredAt: '2026-09-24T11:05:00.000Z',
  sincePreviousSeconds: 3600,
}
const DECIDED: OccurrenceTimelineEvent = {
  actor: { kind: 'contractor', name: 'Compradora Souza' },
  fromStatus: 'awaiting_contractor',
  id: 'case.transition:e1',
  isKey: true,
  kind: 'case.transition',
  note: '',
  occurredAt: '2026-09-24T11:20:00.000Z',
  sincePreviousSeconds: 900,
  toStatus: 'decided',
}
const EVENTS = [RECORDED, SENT, REPLIED, DECIDED] as const

const TIMELINE: OccurrenceTimeline = {
  events: EVENTS,
  timings: {
    contractorAskedAt: '2026-09-24T10:05:00.000Z',
    contractorRepliedAt: '2026-09-24T11:05:00.000Z',
    driverReleasedAt: '2026-09-24T11:20:00.000Z',
    openSince: '2026-09-24T10:00:00.000Z',
    openUntil: null,
  },
}

/**
 * Spec 183 T206 (RF19): a linha do tempo da ocorrência na tela. O cliente é estrito; a tela filtra
 * por participante, pinta pelo ator (as cores dos balões, T704) e conta os três tempos com o
 * relógio dela.
 */
describe('cliente: GET /trip-occurrences/:id/timeline', () => {
  test('lê no caminho da ocorrência, autenticado e sem cache', async () => {
    const requests: Request[] = []
    const client = createTripOccurrenceFeedClient({
      apiUrl: API_URL,
      fetch: (resource, init) => {
        requests.push(new Request(resource, init))
        return Promise.resolve(Response.json({ data: TIMELINE }))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    expect(await client.readOccurrenceTimeline({ occurrenceId: OCCURRENCE_ID })).toEqual(TIMELINE)
    expect(requests[0]?.url).toBe(`${API_URL}/trip-occurrences/${OCCURRENCE_ID}/timeline`)
    expect(requests[0]?.cache).toBe('no-store')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('ator fora dos quatro é resposta inválida', async () => {
    const client = createTripOccurrenceFeedClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: { ...TIMELINE, events: [{ ...RECORDED, actor: { kind: 'robot', name: null } }] },
          }),
        ),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    let failure: unknown = null
    try {
      await client.readOccurrenceTimeline({ occurrenceId: OCCURRENCE_ID })
    } catch (caught) {
      failure = caught
    }
    expect(failure).toBeInstanceOf(Error)
  })
})

describe('a linha do tempo na tela (RF19)', () => {
  test('Tudo mostra tudo; Contratante, o que é dela e os e-mails; Motorista, o que é dele', () => {
    expect(filterOccurrenceTimelineEvents(EVENTS, 'all')).toEqual(EVENTS)
    expect(filterOccurrenceTimelineEvents(EVENTS, 'contractor').map((event) => event.id)).toEqual([
      SENT.id,
      REPLIED.id,
      DECIDED.id,
    ])
    expect(filterOccurrenceTimelineEvents(EVENTS, 'driver').map((event) => event.id)).toEqual([
      RECORDED.id,
    ])
  })

  test('a cor é do ator, a mesma dos balões: operação cobre, contratante azul, motorista verde', () => {
    expect(OCCURRENCE_TIMELINE_ACTOR_TONE).toEqual({
      contractor: 'contractor',
      driver: 'driver',
      operation: 'out',
      system: 'system',
    })
  })

  test('cada evento vira uma frase por chave de locale, com o status da tratativa traduzido', () => {
    expect(describeOccurrenceTimelineEvent(RECORDED)).toEqual({
      key: 'occurrenceTimeline.event.recorded',
      values: {},
    })
    expect(describeOccurrenceTimelineEvent(DECIDED)).toEqual({
      key: 'occurrenceTimeline.event.caseTransition',
      values: { status: 'occurrenceFeed.caseStatus.decided' },
    })
    expect(describeOccurrenceTimelineEvent(SENT)).toEqual({
      key: 'occurrenceTimeline.event.mailSentAutomatic',
      values: {},
    })
    expect(
      describeOccurrenceTimelineEvent({ ...SENT, actor: { kind: 'operation', name: 'Ana' } }),
    ).toEqual({ key: 'occurrenceTimeline.event.mailSent', values: {} })
    expect(describeOccurrenceTimelineEvent(REPLIED)).toEqual({
      key: 'occurrenceTimeline.event.mailReceived',
      values: {},
    })
    expect(
      describeOccurrenceTimelineEvent({
        actor: RECORDED.actor,
        id: 'occurrence.photo:p',
        isKey: false,
        kind: 'occurrence.photo',
        occurredAt: RECORDED.occurredAt,
        photoCount: 3,
        sincePreviousSeconds: 0,
      }),
    ).toEqual({ key: 'occurrenceTimeline.event.photos', values: { count: 3 } })
  })

  test('os três tempos: aberta corre até agora; resposta e liberação param quando acontecem', () => {
    const durations = resolveOccurrenceTimelineDurations(
      TIMELINE.timings,
      new Date('2026-09-24T12:00:00.000Z'),
    )

    expect(durations).toEqual({
      contractorResponse: { running: false, seconds: 3600 },
      driverRelease: { running: false, seconds: 4800 },
      open: { running: true, seconds: 7200 },
    })
  })

  test('sem envio não há tempo de resposta; sem liberação, o tempo do motorista corre', () => {
    const durations = resolveOccurrenceTimelineDurations(
      {
        contractorAskedAt: null,
        contractorRepliedAt: null,
        driverReleasedAt: null,
        openSince: '2026-09-24T10:00:00.000Z',
        openUntil: '2026-09-24T10:30:00.000Z',
      },
      new Date('2026-09-24T12:00:00.000Z'),
    )

    expect(durations.contractorResponse).toBeNull()
    expect(durations.driverRelease).toEqual({ running: true, seconds: 7200 })
    expect(durations.open).toEqual({ running: false, seconds: 1800 })
  })

  test('o intervalo sai compacto: segundos viram min, h e d, sem casas decimais', () => {
    expect(formatOccurrenceElapsed(0)).toBe('0 min')
    expect(formatOccurrenceElapsed(59)).toBe('0 min')
    expect(formatOccurrenceElapsed(300)).toBe('5 min')
    expect(formatOccurrenceElapsed(3600)).toBe('1 h')
    expect(formatOccurrenceElapsed(3900)).toBe('1 h 5 min')
    expect(formatOccurrenceElapsed(90000)).toBe('1 d 1 h')
  })

  test('o intervalo desde o anterior some abaixo de um minuto — "+0 min" é ruído', () => {
    expect(formatOccurrenceGap(null)).toBeNull()
    expect(formatOccurrenceGap(0)).toBeNull()
    expect(formatOccurrenceGap(59)).toBeNull()
    expect(formatOccurrenceGap(60)).toBe('1 min')
    expect(formatOccurrenceGap(3900)).toBe('1 h 5 min')
  })
})
