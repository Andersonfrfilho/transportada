/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 278 CA5: o que o sistema fez sozinho com o retorno da contratante aparece na linha do tempo do painel —
 * a conferência do boleto, a entrega ao motorista (ou a falha), a leitura do motorista e o e-mail sem anexo que
 * deixou o retorno aguardando — e o filtro Automático mostra só o ator Sistema. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  describeOccurrenceTimelineEvent,
  describeOccurrenceTimelineEventDetail,
  filterOccurrenceTimelineEvents,
  OCCURRENCE_TIMELINE_DELIVERY_REASONS,
  OCCURRENCE_TIMELINE_FILTERS,
  OCCURRENCE_TIMELINE_STAGE_REASONS,
  type OccurrenceTimelineEvent,
} from '@/modules/trip/shared/tripOccurrenceTimeline.service'

const TIMINGS = {
  contractorAskedAt: null,
  contractorRepliedAt: null,
  driverReleasedAt: null,
  openSince: '2026-10-21T10:00:00.000Z',
  openUntil: null,
} as const

const BASE = {
  actor: { kind: 'system', name: null },
  isKey: false,
  occurredAt: '2026-10-21T10:30:00.000Z',
  sincePreviousSeconds: 60,
} as const

const CONFIRMED: OccurrenceTimelineEvent = {
  ...BASE,
  id: 'contractor.reply.document:e1',
  invoiceNumber: '912453',
  isKey: true,
  kind: 'contractor.reply.document',
  result: 'confirmed',
  toStatus: 'reply_received',
}
const NOT_CONFIRMED: OccurrenceTimelineEvent = {
  ...CONFIRMED,
  id: 'contractor.reply.document:e2',
  isKey: false,
  result: 'not_confirmed',
  toStatus: 'needs_operator',
}
const WITHOUT_TEXT: OccurrenceTimelineEvent = {
  ...NOT_CONFIRMED,
  id: 'contractor.reply.document:e3',
  result: 'without_text',
}
const DELIVERED: OccurrenceTimelineEvent = {
  ...BASE,
  attempt: 1,
  channel: 'app_chat',
  documentKind: 'boleto',
  driverName: 'MOTORISTA ALVES',
  id: 'contractor.reply.delivery:d1',
  isKey: true,
  kind: 'contractor.reply.delivery',
  reason: null,
  status: 'sent',
}
const FAILED: OccurrenceTimelineEvent = {
  ...DELIVERED,
  attempt: 2,
  driverName: null,
  id: 'contractor.reply.delivery:d2',
  isKey: false,
  reason: 'driver_without_account',
  status: 'skipped',
}
const READ: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'driver', name: 'Motorista Alves' },
  documentKind: 'boleto',
  id: 'contractor.reply.driver_read:d1',
  kind: 'contractor.reply.driver_read',
}
const REQUESTED: OccurrenceTimelineEvent = {
  ...BASE,
  actor: { kind: 'contractor', name: null },
  attachmentCount: 0,
  awaitingAttachment: true,
  deliveryStatus: null,
  id: 'contractor.mail.received:m1',
  interpretation: 'message',
  kind: 'contractor.mail.received',
}
const RECORDED: OccurrenceTimelineEvent = {
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
    deliveryReason: Record<string, string>
    detail: Record<string, string>
    event: Record<string, string>
    filter: Record<string, string>
    stageReason: Record<string, string>
  }
}

function readLocale(file: string): Locale {
  return JSON.parse(
    readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
  ) as Locale
}

describe('spec 278: a linha do tempo mostra o automático', () => {
  test('a conferência do boleto tem título e detalhe com o número da nota', () => {
    expect(describeOccurrenceTimelineEvent(CONFIRMED).key).toBe(
      'occurrenceTimeline.event.documentConfirmed',
    )
    expect(describeOccurrenceTimelineEventDetail(CONFIRMED)).toEqual({
      key: 'occurrenceTimeline.detail.documentConfirmed',
      values: { note: '912453' },
    })
    expect(describeOccurrenceTimelineEvent(NOT_CONFIRMED).key).toBe(
      'occurrenceTimeline.event.documentNotConfirmed',
    )
    expect(describeOccurrenceTimelineEventDetail(NOT_CONFIRMED)).toEqual({
      key: 'occurrenceTimeline.detail.documentNotConfirmed',
      values: { note: '912453' },
    })
    expect(describeOccurrenceTimelineEventDetail(WITHOUT_TEXT)).toEqual({
      key: 'occurrenceTimeline.detail.documentWithoutText',
      values: {},
    })
    expect(describeOccurrenceTimelineEventDetail({ ...CONFIRMED, invoiceNumber: null })?.key).toBe(
      'occurrenceTimeline.detail.documentConfirmedWithoutNote',
    )
  })

  test('a entrega diz o canal e o motorista; a falha diz o motivo e a tentativa', () => {
    expect(describeOccurrenceTimelineEvent(DELIVERED).key).toBe(
      'occurrenceTimeline.event.deliveredBoleto',
    )
    expect(describeOccurrenceTimelineEventDetail(DELIVERED)).toEqual({
      key: 'occurrenceTimeline.detail.deliveredAppChat',
      values: { name: 'Motorista Alves' },
    })
    expect(
      describeOccurrenceTimelineEventDetail({ ...DELIVERED, channel: 'whatsapp', driverName: null })
        ?.key,
    ).toBe('occurrenceTimeline.detail.deliveredWhatsappUnnamed')
    expect(describeOccurrenceTimelineEvent({ ...DELIVERED, documentKind: 'document' }).key).toBe(
      'occurrenceTimeline.event.deliveredDocument',
    )
    expect(describeOccurrenceTimelineEvent(FAILED).key).toBe(
      'occurrenceTimeline.event.deliveryFailed',
    )
    expect(describeOccurrenceTimelineEventDetail(FAILED)).toEqual({
      key: 'occurrenceTimeline.detail.deliveryFailed',
      values: { attempt: 2, reason: 'occurrenceTimeline.deliveryReason.driver_without_account' },
    })
    expect(describeOccurrenceTimelineEventDetail({ ...FAILED, reason: 'something_new' })).toEqual({
      key: 'occurrenceTimeline.detail.deliveryAttempt',
      values: { attempt: 2 },
    })
    expect(describeOccurrenceTimelineEvent({ ...FAILED, status: 'pending_window' }).key).toBe(
      'occurrenceTimeline.event.deliveryPending',
    )
  })

  test('a leitura do motorista é dele; o e-mail sem anexo diz que segue aguardando', () => {
    expect(describeOccurrenceTimelineEvent(READ).key).toBe(
      'occurrenceTimeline.event.driverReadBoleto',
    )
    expect(describeOccurrenceTimelineEventDetail(READ)).toBeNull()
    expect(describeOccurrenceTimelineEvent(REQUESTED).key).toBe(
      'occurrenceTimeline.event.mailReceived',
    )
    expect(describeOccurrenceTimelineEventDetail(REQUESTED)).toEqual({
      key: 'occurrenceTimeline.detail.awaitingAttachment',
      values: {},
    })
    expect(
      describeOccurrenceTimelineEventDetail({ ...REQUESTED, awaitingAttachment: false }),
    ).toBeNull()
  })

  test('o filtro Automático vem depois dos três e mostra só o ator Sistema', () => {
    expect(OCCURRENCE_TIMELINE_FILTERS).toEqual(['all', 'contractor', 'driver', 'automatic'])
    const events = [RECORDED, REQUESTED, CONFIRMED, DELIVERED, READ]
    expect(filterOccurrenceTimelineEvents(events, 'automatic')).toEqual([CONFIRMED, DELIVERED])
    expect(filterOccurrenceTimelineEvents(events, 'driver')).toEqual([RECORDED, READ])
    expect(filterOccurrenceTimelineEvents(events, 'contractor')).toEqual([REQUESTED, CONFIRMED])
  })

  test('o cliente lê os eventos novos; o malformado reprova como os demais', async () => {
    const timeline = await readTimeline({
      events: [CONFIRMED, DELIVERED, FAILED, READ, REQUESTED],
      timings: TIMINGS,
    })
    expect(timeline.events).toEqual([CONFIRMED, DELIVERED, FAILED, READ, REQUESTED])
    expect(
      await readTimeline({
        events: [{ ...DELIVERED, attempt: 'one' }],
        timings: TIMINGS,
      }).catch(() => 'rejected'),
    ).toBe('rejected')
  })

  test('o e-mail da API anterior, sem anexo nem aguardando, continua valendo e não tem detalhe', async () => {
    const legacy = {
      actor: { kind: 'contractor', name: null },
      deliveryStatus: null,
      id: 'contractor.mail.received:m0',
      interpretation: 'message',
      isKey: false,
      kind: 'contractor.mail.received',
      occurredAt: BASE.occurredAt,
      sincePreviousSeconds: null,
    }
    const [event] = (await readTimeline({ events: [legacy], timings: TIMINGS })).events
    expect(event === undefined ? undefined : describeOccurrenceTimelineEventDetail(event)).toBe(
      null,
    )
  })

  test.each(['trip.locale.json', 'trip.en.locale.json'])(
    '%s tem título, detalhe, motivo e o filtro Automático',
    (file) => {
      const timeline = readLocale(file).occurrenceTimeline
      for (const key of [
        'documentConfirmed',
        'documentNotConfirmed',
        'deliveredBoleto',
        'deliveredDocument',
        'deliveryFailed',
        'deliveryPending',
        'driverReadBoleto',
        'driverReadDocument',
      ]) {
        expect(timeline.event[key]).toBeString()
      }
      expect(timeline.detail.documentConfirmed).toContain('{{note}}')
      expect(timeline.detail.documentNotConfirmed).toContain('{{note}}')
      expect(timeline.detail.deliveredAppChat).toContain('{{name}}')
      expect(timeline.detail.deliveredWhatsapp).toContain('{{name}}')
      expect(timeline.detail.deliveryFailed).toContain('{{reason}}')
      expect(timeline.detail.deliveryFailed).toContain('{{attempt}}')
      for (const key of [
        'documentConfirmedWithoutNote',
        'documentNotConfirmedWithoutNote',
        'documentWithoutText',
        'deliveredAppChatUnnamed',
        'deliveredWhatsappUnnamed',
        'deliveryAttempt',
        'awaitingAttachment',
      ]) {
        expect(timeline.detail[key]).toBeString()
      }
      for (const reason of OCCURRENCE_TIMELINE_DELIVERY_REASONS) {
        expect(timeline.deliveryReason[reason]).toBeString()
      }
      for (const reason of OCCURRENCE_TIMELINE_STAGE_REASONS) {
        expect(timeline.stageReason[reason]).toBeString()
      }
      expect(timeline.filter.automatic).toBeString()
    },
  )

  test('a frase pt-BR é a do desenho aprovado', () => {
    const timeline = readLocale('trip.locale.json').occurrenceTimeline
    expect(timeline.event.documentConfirmed).toBe('Boleto conferido')
    expect(timeline.event.documentNotConfirmed).toBe('Boleto não conferido')
    expect(timeline.event.deliveredBoleto).toBe('Boleto entregue ao motorista')
    expect(timeline.event.deliveryFailed).toBe('Falhou a entrega ao motorista')
    expect(timeline.event.driverReadBoleto).toBe('O motorista leu o boleto')
    expect(timeline.detail.documentConfirmed).toBe(
      'Linha digitável e número da nota {{note}} encontrados no PDF.',
    )
    expect(timeline.detail.deliveredAppChat).toBe('Pelo chat do app, para {{name}}.')
    expect(timeline.detail.awaitingAttachment).toBe('Sem anexo. Segue aguardando o boleto.')
    expect(timeline.detail.documentWithoutText).toBe('PDF sem texto para conferir.')
    expect(timeline.filter.automatic).toBe('Automático')
  })
})
