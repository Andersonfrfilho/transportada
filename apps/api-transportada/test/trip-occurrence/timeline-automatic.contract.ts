/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 278 CA3: o que o sistema faz sozinho com o retorno da contratante entra na linha do tempo — a conferência
 * do boleto (o motivo do evento do retorno), a entrega ao motorista e a leitura dele — e o e-mail sem anexo que
 * deixou o retorno aguardando diz isso. As etapas da 276 T3 não mudam.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceTimeline,
  type OccurrenceTimelineSource,
} from '../../src/trips/domain/occurrence-timeline.policy.js'

const AT = (minutes: number): string =>
  new Date(Date.parse('2026-10-21T10:00:00.000Z') + minutes * 60_000).toISOString()

const SYSTEM = { kind: 'system', name: null } as const

const RECORDED: OccurrenceTimelineSource = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence-1',
  kind: 'occurrence.recorded',
  occurredAt: AT(0),
}

function reply(
  id: string,
  minutes: number,
  toStatus: string,
  reason: null | string = null,
): OccurrenceTimelineSource {
  return { actor: SYSTEM, id, kind: 'contractor.reply', occurredAt: AT(minutes), reason, toStatus }
}

function documentCheck(
  id: string,
  minutes: number,
  result: 'confirmed' | 'not_confirmed' | 'without_text',
  toStatus: string,
): OccurrenceTimelineSource {
  return {
    actor: SYSTEM,
    id,
    invoiceNumber: '912453',
    kind: 'contractor.reply.document',
    occurredAt: AT(minutes),
    result,
    toStatus,
  }
}

function delivery(
  id: string,
  minutes: number,
  status: string,
  attempt: number,
  reason: null | string = null,
): OccurrenceTimelineSource {
  return {
    actor: SYSTEM,
    attempt,
    channel: 'app_chat',
    documentKind: 'boleto',
    driverName: status === 'sent' ? 'Motorista Alves' : null,
    id,
    kind: 'contractor.reply.delivery',
    occurredAt: AT(minutes),
    reason,
    status,
  }
}

function received(id: string, minutes: number, attachmentCount: null | number) {
  return {
    actor: { kind: 'contractor', name: null },
    attachmentCount,
    deliveryStatus: null,
    id,
    interpretation: 'message',
    kind: 'contractor.mail.received',
    occurredAt: AT(minutes),
  } as OccurrenceTimelineSource
}

const READ: OccurrenceTimelineSource = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  documentKind: 'boleto',
  id: 'delivery-1',
  kind: 'contractor.reply.driver_read',
  occurredAt: AT(40),
}

describe('a linha do tempo mostra o automático (spec 278 CA3)', () => {
  test('conferido, recebido, entregue e lido no mesmo instante saem na ordem do que aconteceu', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        READ,
        reply('event-delivered', 30, 'delivered'),
        delivery('delivery-1', 30, 'sent', 1),
        reply('event-received', 30, 'reply_received', 'document_confirmed'),
        documentCheck('event-received', 30, 'confirmed', 'reply_received'),
        reply('reply-1', 5, 'awaiting_contractor'),
        RECORDED,
      ],
    })

    expect(timeline.events.map((event) => event.kind)).toEqual([
      'occurrence.recorded',
      'contractor.reply',
      'contractor.reply.document',
      'contractor.reply',
      'contractor.reply.delivery',
      'contractor.reply',
      'contractor.reply.driver_read',
    ])
    /** Os ids continuam únicos: a conferência e a transição nascem da mesma linha do histórico. */
    expect(new Set(timeline.events.map((event) => event.id)).size).toBe(timeline.events.length)
  })

  test('o boleto conferido e a entrega feita são marcos; a recusa, a falha e a leitura não', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        documentCheck('a', 10, 'not_confirmed', 'needs_operator'),
        documentCheck('b', 20, 'confirmed', 'reply_received'),
        delivery('c', 21, 'skipped', 1, 'driver_without_account'),
        delivery('d', 22, 'sent', 2),
        READ,
      ],
    })

    expect(timeline.events.map((event) => [event.kind, event.isKey])).toEqual([
      ['occurrence.recorded', true],
      ['contractor.reply.document', false],
      ['contractor.reply.document', true],
      ['contractor.reply.delivery', false],
      ['contractor.reply.delivery', true],
      ['contractor.reply.driver_read', false],
    ])
  })

  test('o e-mail sem anexo com o retorno aguardando segue aguardando; com anexo ou depois, não', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        reply('reply-1', 5, 'awaiting_contractor'),
        received('solicitado', 10, 0),
        received('segue', 15, 1),
        reply('event-operator', 15, 'needs_operator', 'document_not_confirmed'),
        received('depois', 20, 0),
      ],
    })

    const mails = timeline.events.flatMap((event) =>
      event.kind === 'contractor.mail.received' ? [[event.id, event.awaitingAttachment]] : [],
    )
    expect(mails).toEqual([
      ['contractor.mail.received:solicitado', true],
      ['contractor.mail.received:segue', false],
      ['contractor.mail.received:depois', false],
    ])
  })

  test('o retorno vencido também segue aguardando; sem retorno ou sem conversa, nada se afirma', () => {
    const overdue = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        reply('reply-1', 5, 'awaiting_contractor'),
        reply('overdue', 8, 'overdue'),
        received('solicitado', 10, 0),
      ],
    })
    const withoutReply = buildOccurrenceTimeline({
      sources: [RECORDED, received('solicitado', 10, 0)],
    })
    const withoutConversation = buildOccurrenceTimeline({
      sources: [RECORDED, reply('reply-1', 5, 'awaiting_contractor'), received('x', 10, null)],
    })

    const awaiting = (sources: ReturnType<typeof buildOccurrenceTimeline>) =>
      sources.events.flatMap((event) =>
        event.kind === 'contractor.mail.received' ? [event.awaitingAttachment] : [],
      )
    expect(awaiting(overdue)).toEqual([true])
    expect(awaiting(withoutReply)).toEqual([false])
    expect(awaiting(withoutConversation)).toEqual([false])
  })

  test('os eventos novos não mudam as etapas; o motivo da etapa é só o da ida ao operador', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        reply('reply-1', 5, 'awaiting_contractor'),
        documentCheck('event-received', 30, 'confirmed', 'awaiting_operator'),
        reply('event-received', 30, 'awaiting_operator', 'document_confirmed'),
        READ,
      ],
    })

    expect(timeline.stages.map((stage) => [stage.stage, stage.reason])).toEqual([
      ['received', null],
      ['awaiting_contractor', null],
      ['awaiting_operator', null],
    ])

    const withoutText = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        reply('reply-1', 5, 'awaiting_contractor'),
        reply('event-operator', 30, 'needs_operator', 'document_without_text'),
      ],
    })
    expect(withoutText.stages.at(-1)).toMatchObject({
      reason: 'document_without_text',
      stage: 'awaiting_operator',
    })
  })

  /** Spec 281 T9: o boleto ao cliente por WhatsApp entra na linha; marco só quando sai, e não muda a etapa. */
  test('o boleto enviado ao cliente por WhatsApp entra na linha; só o enviado é marco e não muda a etapa', () => {
    const client = (
      id: string,
      minutes: number,
      status: string,
      reason: null | string = null,
    ): OccurrenceTimelineSource => ({
      actor: SYSTEM,
      id,
      kind: 'contractor.client.whatsapp',
      occurredAt: AT(minutes),
      reason,
      status,
    })
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        reply('reply-1', 5, 'awaiting_contractor'),
        client('client-failed', 12, 'failed', 'whatsapp_disconnected'),
        client('client-sent', 14, 'sent'),
        client('client-pending', 15, 'queued'),
      ],
    })

    expect(
      timeline.events.flatMap((event) =>
        event.kind === 'contractor.client.whatsapp'
          ? [[event.id, event.status, event.reason, event.isKey]]
          : [],
      ),
    ).toEqual([
      ['contractor.client.whatsapp:client-failed', 'failed', 'whatsapp_disconnected', false],
      ['contractor.client.whatsapp:client-sent', 'sent', null, true],
      ['contractor.client.whatsapp:client-pending', 'queued', null, false],
    ])
    expect(timeline.stages.map((stage) => stage.stage)).toEqual(['received', 'awaiting_contractor'])
    /** Log e linha não levam número, texto nem anexo: só o que o evento diz (status e motivo). */
    const clientEvent = timeline.events.find((event) => event.kind === 'contractor.client.whatsapp')
    expect(Object.keys(clientEvent ?? {}).sort()).toEqual(
      [
        'actor',
        'id',
        'isKey',
        'kind',
        'occurredAt',
        'reason',
        'sincePreviousSeconds',
        'status',
      ].sort(),
    )
  })
})
