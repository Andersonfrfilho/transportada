/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 324 T2: o aviso à contratante aparece na linha do tempo do painel — o automático no grupo do WhatsApp (318), que a
 * API já mandava e o painel descartava em silêncio, e o botão "Avisar a contratante", com quem clicou, o canal e o
 * motivo quando não saiu. Os dois entram no filtro Contratante. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  describeOccurrenceTimelineEvent,
  describeOccurrenceTimelineEventDetail,
  filterOccurrenceTimelineEvents,
  OCCURRENCE_TIMELINE_CONTRACTOR_NOTICE_REASONS,
  type OccurrenceTimelineEvent,
} from '@/modules/trip/shared/tripOccurrenceTimeline.service'

const TIMINGS = {
  contractorAskedAt: null,
  contractorRepliedAt: null,
  driverReleasedAt: null,
  openSince: '2026-11-13T10:00:00.000Z',
  openUntil: null,
} as const

const BASE = {
  isKey: false,
  occurredAt: '2026-11-13T10:30:00.000Z',
  sincePreviousSeconds: 60,
} as const

const GROUP_SENT: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'system', name: null },
  id: 'contractor.group.whatsapp:o1:contractor-group',
  isKey: true,
  kind: 'contractor.group.whatsapp',
  reason: null,
  status: 'sent',
}
const GROUP_FALLBACK: OccurrenceTimelineEvent = {
  ...GROUP_SENT,
  isKey: false,
  reason: 'disconnected',
  status: 'email_fallback',
}
const GROUP_FAILED: OccurrenceTimelineEvent = {
  ...GROUP_SENT,
  isKey: false,
  reason: 'group_not_found',
  status: 'failed',
}
const MANUAL_FAILED: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'operation', name: 'OPERADORA LIMA' },
  channel: null,
  id: 'contractor.notice.manual:n1',
  kind: 'contractor.notice.manual',
  reason: 'no_recipient',
  status: 'failed',
}
const MANUAL_EMAIL: OccurrenceTimelineEvent = {
  ...MANUAL_FAILED,
  channel: 'email',
  id: 'contractor.notice.manual:n2',
  isKey: true,
  reason: null,
  status: 'sent',
}
const MANUAL_GROUP: OccurrenceTimelineEvent = {
  ...MANUAL_EMAIL,
  channel: 'whatsapp_group',
  id: 'contractor.notice.manual:n3',
}
const MANUAL_FALLBACK: OccurrenceTimelineEvent = {
  ...MANUAL_EMAIL,
  channel: 'email_fallback',
  id: 'contractor.notice.manual:n4',
  reason: 'disconnected',
}
const DRIVER: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence.recorded:o1',
  isKey: true,
  kind: 'occurrence.recorded',
}

function readTimeline(data: Record<string, unknown>) {
  return createTripOccurrenceFeedClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  }).readOccurrenceTimeline({ occurrenceId: 'occurrence-1' })
}

type Locale = {
  occurrenceTimeline: {
    contractorNoticeReason: Record<string, string>
    event: Record<string, string>
  }
}

function readLocale(file: string): Locale {
  return JSON.parse(
    readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
  ) as Locale
}

describe('spec 324 T2: o aviso à contratante na linha do tempo', () => {
  test('o cliente lê os dois tipos novos em vez de descartá-los; o malformado reprova', async () => {
    const events = [GROUP_SENT, MANUAL_FAILED, MANUAL_EMAIL]
    expect((await readTimeline({ events, timings: TIMINGS })).events).toEqual(events)
    expect(
      await readTimeline({
        events: [{ ...MANUAL_EMAIL, channel: 7 }],
        timings: TIMINGS,
      }).catch(() => 'rejected'),
    ).toBe('rejected')
  })

  test('o aviso automático no grupo diz se saiu, se caiu no e-mail ou se falhou, e por quê', () => {
    expect(describeOccurrenceTimelineEvent(GROUP_SENT).key).toBe(
      'occurrenceTimeline.event.contractorGroupSent',
    )
    expect(describeOccurrenceTimelineEvent(GROUP_FALLBACK).key).toBe(
      'occurrenceTimeline.event.contractorGroupEmailFallback',
    )
    expect(describeOccurrenceTimelineEvent(GROUP_FAILED).key).toBe(
      'occurrenceTimeline.event.contractorGroupFailed',
    )
    expect(describeOccurrenceTimelineEventDetail(GROUP_SENT)).toBeNull()
    expect(describeOccurrenceTimelineEventDetail(GROUP_FAILED)).toEqual({
      key: 'occurrenceTimeline.contractorNoticeReason.group_not_found',
      values: {},
    })
  })

  test('o botão diz quem avisou e por onde; a falha diz o motivo conhecido', () => {
    expect(describeOccurrenceTimelineEvent(MANUAL_EMAIL)).toEqual({
      key: 'occurrenceTimeline.event.manualNoticeEmail',
      values: { name: 'Operadora Lima' },
    })
    expect(describeOccurrenceTimelineEvent(MANUAL_GROUP).key).toBe(
      'occurrenceTimeline.event.manualNoticeGroup',
    )
    expect(describeOccurrenceTimelineEvent(MANUAL_FALLBACK).key).toBe(
      'occurrenceTimeline.event.manualNoticeEmailFallback',
    )
    expect(describeOccurrenceTimelineEvent(MANUAL_FAILED).key).toBe(
      'occurrenceTimeline.event.manualNoticeFailed',
    )
    expect(
      describeOccurrenceTimelineEvent({ ...MANUAL_EMAIL, actor: { kind: 'operation', name: null } })
        .key,
    ).toBe('occurrenceTimeline.event.manualNoticeEmailUnnamed')
    expect(describeOccurrenceTimelineEventDetail(MANUAL_FAILED)).toEqual({
      key: 'occurrenceTimeline.contractorNoticeReason.no_recipient',
      values: {},
    })
    expect(describeOccurrenceTimelineEventDetail(MANUAL_EMAIL)).toBeNull()
    expect(
      describeOccurrenceTimelineEventDetail({ ...MANUAL_FAILED, reason: 'unheard_of' }),
    ).toBeNull()
  })

  test('os dois entram no filtro Contratante; o automático também no Automático', () => {
    const events = [DRIVER, GROUP_SENT, MANUAL_EMAIL]
    expect(filterOccurrenceTimelineEvents(events, 'contractor')).toEqual([GROUP_SENT, MANUAL_EMAIL])
    expect(filterOccurrenceTimelineEvents(events, 'automatic')).toEqual([GROUP_SENT])
  })

  test.each(['trip.locale.json', 'trip.en.locale.json'])(
    'o locale %s tem toda frase que a tela pede',
    (file) => {
      const timeline = readLocale(file).occurrenceTimeline
      const channels = [
        'manualNoticeEmail',
        'manualNoticeGroup',
        'manualNoticeEmailFallback',
        'manualNoticeSent',
        'manualNoticeFailed',
      ]
      for (const key of [
        'contractorGroupSent',
        'contractorGroupEmailFallback',
        'contractorGroupFailed',
        ...channels,
        ...channels.map((key) => `${key}Unnamed`),
      ]) {
        expect(timeline.event[key]).toBeString()
      }
      for (const key of channels) expect(timeline.event[key]).toContain('{{name}}')
      for (const reason of OCCURRENCE_TIMELINE_CONTRACTOR_NOTICE_REASONS) {
        expect(timeline.contractorNoticeReason[reason]).toBeString()
      }
    },
  )
})
