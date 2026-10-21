/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  describeOccurrenceTimelineEvent,
  filterOccurrenceTimelineEvents,
  OCCURRENCE_TIMELINE_STAGE_REASONS,
  OCCURRENCE_TIMELINE_STAGES,
  resolveOccurrenceStageDuration,
  type OccurrenceTimelineEvent,
  type OccurrenceTimelineStage,
} from '@/modules/trip/shared/tripOccurrenceTimeline.service'

const TIMINGS = {
  contractorAskedAt: null,
  contractorRepliedAt: null,
  driverReleasedAt: null,
  openSince: '2026-10-20T10:00:00.000Z',
  openUntil: null,
} as const

const REPLY: OccurrenceTimelineEvent = {
  actor: { kind: 'system', name: null },
  id: 'contractor.reply:r1',
  isKey: false,
  kind: 'contractor.reply',
  occurredAt: '2026-10-20T10:10:00.000Z',
  reason: 'document_not_confirmed',
  sincePreviousSeconds: 600,
  toStatus: 'needs_operator',
}

const RECEIVED: OccurrenceTimelineStage = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  durationSeconds: 600,
  endedAt: '2026-10-20T10:10:00.000Z',
  reason: null,
  stage: 'received',
  startedAt: '2026-10-20T10:00:00.000Z',
  terminal: false,
}
const WAITING: OccurrenceTimelineStage = {
  actor: { kind: 'system', name: null },
  durationSeconds: null,
  endedAt: null,
  reason: 'document_not_confirmed',
  stage: 'awaiting_operator',
  startedAt: '2026-10-20T10:10:00.000Z',
  terminal: false,
}
const RESOLVED: OccurrenceTimelineStage = {
  ...WAITING,
  reason: null,
  stage: 'resolved',
  terminal: true,
}

function readTimeline(data: Record<string, unknown>) {
  return createTripOccurrenceFeedClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  }).readOccurrenceTimeline({ occurrenceId: 'occurrence-1' })
}

describe('spec 276 T3: as etapas da ocorrência no painel', () => {
  test('o retorno da contratante é evento conhecido, com frase e o filtro da contratante', () => {
    expect(describeOccurrenceTimelineEvent(REPLY)).toEqual({
      key: 'occurrenceTimeline.event.contractorReply',
      values: { status: 'occurrenceTimeline.replyStatus.needs_operator' },
    })
    expect(filterOccurrenceTimelineEvents([REPLY], 'contractor')).toEqual([REPLY])
  })

  test('a etapa encerrada mostra quanto durou; a aberta conta com o relógio; a terminal não tem duração', () => {
    const now = new Date('2026-10-20T10:40:00.000Z')
    expect(resolveOccurrenceStageDuration(RECEIVED, now)).toEqual({ running: false, seconds: 600 })
    expect(resolveOccurrenceStageDuration(WAITING, now)).toEqual({ running: true, seconds: 1800 })
    expect(resolveOccurrenceStageDuration(RESOLVED, now)).toBeNull()
  })

  test('o cliente lê etapas, resolvedAt e o retorno', async () => {
    const timeline = await readTimeline({
      events: [REPLY],
      stages: [RECEIVED, WAITING],
      timings: { ...TIMINGS, resolvedAt: null },
    })
    expect(timeline.events).toEqual([REPLY])
    expect(timeline.stages).toEqual([RECEIVED, WAITING])
    expect(timeline.timings.resolvedAt).toBeNull()
  })

  test('a API anterior, sem etapas nem resolvedAt, continua valendo', async () => {
    const timeline = await readTimeline({ events: [], timings: TIMINGS })
    expect(timeline.stages).toBeUndefined()
    expect('resolvedAt' in timeline.timings).toBe(false)
  })

  test('etapa de nome novo ou malformada sai sozinha; resolvedAt malformado some sem derrubar os tempos', async () => {
    const timeline = await readTimeline({
      events: [],
      stages: [RECEIVED, { ...WAITING, stage: 'something_new' }, { ...WAITING, startedAt: 7 }],
      timings: { ...TIMINGS, resolvedAt: 42 },
    })
    expect(timeline.stages).toEqual([RECEIVED])
    expect(timeline.timings.openSince).toBe(TIMINGS.openSince)
    expect('resolvedAt' in timeline.timings).toBe(false)
  })

  test('o retorno sem o status reprova a resposta, como os demais eventos estritos', async () => {
    const withoutStatus = { ...REPLY, toStatus: undefined }
    expect(
      await readTimeline({ events: [withoutStatus], timings: TIMINGS }).catch(() => 'rejected'),
    ).toBe('rejected')
  })

  test('a lista de etapas é a da API', () => {
    const policy = readFileSync(
      new URL(
        '../../../api-transportada/src/trips/domain/occurrence-timeline.policy.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const block = /OCCURRENCE_STAGES = \[([^\]]+)\]/.exec(policy)?.[1] ?? ''
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])).toEqual([
      ...OCCURRENCE_TIMELINE_STAGES,
    ])
  })

  test.each(['trip.locale.json', 'trip.en.locale.json'])(
    '%s tem a frase de cada etapa, motivo e status do retorno',
    (file) => {
      const locale = JSON.parse(
        readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
      ) as {
        occurrenceTimeline: Record<string, Record<string, string> | string> & {
          event: Record<string, string>
          replyStatus: Record<string, string>
          stage: Record<string, string>
          stageReason: Record<string, string>
        }
      }
      const timeline = locale.occurrenceTimeline
      for (const stage of OCCURRENCE_TIMELINE_STAGES) expect(timeline.stage[stage]).toBeString()
      for (const reason of OCCURRENCE_TIMELINE_STAGE_REASONS) {
        expect(timeline.stageReason[reason]).toBeString()
      }
      for (const status of [
        'awaiting_contractor',
        'overdue',
        'reply_received',
        'awaiting_operator',
        'needs_operator',
        'delivered',
        'handled',
        'cancelled',
      ]) {
        expect(timeline.replyStatus[status]).toBeString()
      }
      expect(timeline.event.contractorReply).toContain('{{status}}')
      expect(timeline.stageRunning).toContain('{{elapsed}}')
      expect(timeline.stageLasted).toContain('{{elapsed}}')
    },
  )
})
