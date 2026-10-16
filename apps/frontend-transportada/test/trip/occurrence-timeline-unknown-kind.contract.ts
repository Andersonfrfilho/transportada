/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000d266'

const RECORDED = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence.recorded:1',
  isKey: true,
  kind: 'occurrence.recorded',
  occurredAt: '2026-09-24T10:00:00.000Z',
  sincePreviousSeconds: null,
} as const
const DECIDED = {
  actor: { kind: 'contractor', name: 'Compradora Souza' },
  fromStatus: 'awaiting_contractor',
  id: 'case.transition:e1',
  isKey: true,
  kind: 'case.transition',
  note: '',
  occurredAt: '2026-09-24T11:20:00.000Z',
  sincePreviousSeconds: 900,
  toStatus: 'decided',
} as const
const TIMINGS = {
  contractorAskedAt: null,
  contractorRepliedAt: null,
  driverReleasedAt: null,
  openSince: '2026-09-24T10:00:00.000Z',
  openUntil: null,
} as const

function futureEvent(kind: string) {
  return {
    actor: { kind: 'operation', name: 'Operação' },
    id: `${kind}:future`,
    isKey: true,
    kind,
    occurredAt: '2026-09-24T11:30:00.000Z',
    resolution: { reopenedBy: 'x' },
    sincePreviousSeconds: 600,
  }
}

function readTimeline(data: unknown) {
  const client = createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json({ data })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  return client.readOccurrenceTimeline({ occurrenceId: OCCURRENCE_ID })
}

async function readTimelineFailure(data: unknown): Promise<unknown> {
  try {
    await readTimeline(data)
  } catch (caught) {
    return caught
  }
  return null
}

/**
 * Spec 266 T1.2: a API pode ganhar tipos de evento que o painel ainda não conhece. Evento de tipo desconhecido
 * sai da linha do tempo; os eventos conhecidos seguem na ordem. Resposta estruturalmente inválida
 * continua reprovada.
 */
describe('spec 266 T1.2: evento de linha do tempo desconhecido', () => {
  test('descarta resolution.escalated e mantém os eventos válidos na ordem', async () => {
    const timeline = await readTimeline({
      events: [RECORDED, futureEvent('resolution.escalated'), DECIDED],
      timings: TIMINGS,
    })

    expect(timeline.events.map((event) => event.id)).toEqual([RECORDED.id, DECIDED.id])
    expect(timeline.timings).toEqual(TIMINGS)
  })

  test('descarta resolution.archived', async () => {
    const timeline = await readTimeline({
      events: [futureEvent('resolution.archived'), RECORDED],
      timings: TIMINGS,
    })

    expect(timeline.events.map((event) => event.id)).toEqual([RECORDED.id])
  })

  test('evento desconhecido malformado também sai, sem reprovar a linha', async () => {
    const timeline = await readTimeline({
      events: [RECORDED, { kind: 'resolution.escalated' }],
      timings: TIMINGS,
    })

    expect(timeline.events.map((event) => event.id)).toEqual([RECORDED.id])
  })

  test('events que não é lista continua sendo resposta inválida', async () => {
    expect(await readTimelineFailure({ events: 'nope', timings: TIMINGS })).toBeInstanceOf(Error)
  })

  test('evento conhecido malformado continua reprovando a linha', async () => {
    const failure = await readTimelineFailure({
      events: [{ ...RECORDED, actor: { kind: 'robot', name: null } }],
      timings: TIMINGS,
    })
    expect(failure).toBeInstanceOf(Error)
  })
})
