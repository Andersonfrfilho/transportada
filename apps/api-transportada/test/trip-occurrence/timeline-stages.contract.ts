/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T3: os status da ocorrência com o horário e a duração de cada etapa, derivados dos eventos que a
 * linha do tempo já lê (registro, tratativa da 164, e-mails da 143, retorno da 248, andamento da 266,
 * cancelamento da 240). Nada é gravado: a etapa é leitura.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceTimeline,
  type OccurrenceTimelineSource,
} from '../../src/trips/domain/occurrence-timeline.policy.js'

const AT = (minutes: number): string =>
  new Date(Date.parse('2026-10-20T10:00:00.000Z') + minutes * 60_000).toISOString()

const RECORDED: OccurrenceTimelineSource = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence-1',
  kind: 'occurrence.recorded',
  occurredAt: AT(0),
}

function caseTo(id: string, minutes: number, toStatus: string): OccurrenceTimelineSource {
  return {
    actor: { kind: 'operation', name: 'Operadora Lima' },
    fromStatus: null,
    id,
    kind: 'case.transition',
    note: '',
    occurredAt: AT(minutes),
    toStatus,
  }
}

function replyTo(
  id: string,
  minutes: number,
  toStatus: string,
  reason: null | string = null,
): OccurrenceTimelineSource {
  return {
    actor: { kind: 'system', name: null },
    id,
    kind: 'contractor.reply',
    occurredAt: AT(minutes),
    reason,
    toStatus,
  }
}

function mail(id: string, minutes: number, direction: 'inbound' | 'outbound') {
  return {
    actor:
      direction === 'outbound'
        ? { kind: 'system' as const, name: null }
        : { kind: 'contractor' as const, name: null },
    deliveryStatus: null,
    id,
    interpretation: null,
    kind: direction === 'outbound' ? 'contractor.mail.sent' : 'contractor.mail.received',
    occurredAt: AT(minutes),
  } as OccurrenceTimelineSource
}

const RESOLVED = (minutes: number): OccurrenceTimelineSource => ({
  actor: { kind: 'system', name: null },
  id: `resolved-${minutes}`,
  kind: 'resolution.resolved',
  note: null,
  occurredAt: AT(minutes),
  phraseKey: null,
})

function stagesOf(sources: readonly OccurrenceTimelineSource[]) {
  return buildOccurrenceTimeline({ sources }).stages.map((stage) => [
    stage.stage,
    stage.startedAt,
    stage.durationSeconds,
  ])
}

describe('as etapas da ocorrência (spec 276 T3)', () => {
  test('a prorrogação do boleto: recebida, aguardando, resposta, entregue ao motorista, solucionada', () => {
    const sources = [
      RECORDED,
      mail('mail-1', 1, 'outbound'),
      replyTo('reply-open', 1, 'awaiting_contractor'),
      mail('mail-2', 30, 'inbound'),
      replyTo('reply-1', 31, 'reply_received'),
      replyTo('reply-2', 32, 'delivered'),
      RESOLVED(32),
    ]

    expect(stagesOf(sources)).toEqual([
      ['received', AT(0), 60],
      ['awaiting_contractor', AT(1), 30 * 60],
      ['reply_received', AT(31), 60],
      ['delivered', AT(32), 0],
      ['resolved', AT(32), null],
    ])
  })

  test('o operador que pega a tratativa abre a ocorrência', () => {
    expect(
      stagesOf([RECORDED, caseTo('case-1', 0, 'recorded'), caseTo('case-2', 5, 'under_review')]),
    ).toEqual([
      ['received', AT(0), 300],
      ['in_progress', AT(5), null],
    ])
  })

  test('a última etapa em aberto não tem fim: a tela conta com o relógio dela', () => {
    const [last] = buildOccurrenceTimeline({ sources: [RECORDED] }).stages
    expect(last).toMatchObject({ endedAt: null, stage: 'received', terminal: false })
  })

  test('o PDF que não é o boleto põe a ocorrência aguardando o operador, com o motivo', () => {
    const { stages } = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        replyTo('open', 1, 'awaiting_contractor'),
        replyTo('r1', 10, 'needs_operator', 'document_not_confirmed'),
      ],
    })

    expect(stages.at(-1)).toMatchObject({
      reason: 'document_not_confirmed',
      stage: 'awaiting_operator',
      startedAt: AT(10),
    })
  })

  test('o retorno atrasado continua aguardando a contratante: não abre etapa nova', () => {
    expect(
      stagesOf([
        RECORDED,
        replyTo('open', 1, 'awaiting_contractor'),
        replyTo('late', 60, 'overdue'),
      ]).map(([stage]) => stage),
    ).toEqual(['received', 'awaiting_contractor'])
  })

  test('sem o retorno da 248, o e-mail enviado espera e o recebido é a resposta', () => {
    expect(
      stagesOf([RECORDED, mail('m1', 2, 'outbound'), mail('m2', 20, 'inbound')]).map(
        ([stage]) => stage,
      ),
    ).toEqual(['received', 'awaiting_contractor', 'reply_received'])
  })

  test('com o retorno da 248, o e-mail "Solicitado" não é a resposta: quem diz é o retorno', () => {
    expect(
      stagesOf([
        RECORDED,
        replyTo('open', 1, 'awaiting_contractor'),
        mail('m1', 1, 'outbound'),
        mail('solicitado', 10, 'inbound'),
      ]).map(([stage]) => stage),
    ).toEqual(['received', 'awaiting_contractor'])
  })

  test('a decisão da contratante na tratativa é a resposta; o encerramento soluciona', () => {
    expect(
      stagesOf([
        RECORDED,
        caseTo('c1', 1, 'awaiting_contractor'),
        caseTo('c2', 20, 'decided'),
        caseTo('c3', 30, 'closed'),
      ]).map(([stage]) => stage),
    ).toEqual(['received', 'awaiting_contractor', 'reply_received', 'resolved'])
  })

  test('reaberta pelo motorista volta a uma etapa aberta e o tempo de solução é o da última', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        RESOLVED(10),
        {
          actor: { kind: 'driver', name: 'Motorista Alves' },
          id: 'reopen-1',
          kind: 'resolution.reopened',
          messageId: 'message-1',
          occurredAt: AT(20),
        },
        RESOLVED(50),
      ],
    })

    expect(timeline.stages.map((stage) => stage.stage)).toEqual([
      'received',
      'resolved',
      'reopened',
      'resolved',
    ])
    expect(timeline.timings.resolvedAt).toBe(AT(50))
  })

  test('cancelada é terminal, e não há tempo de solução', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        {
          actor: { kind: 'operation', name: 'Operadora Lima' },
          id: 'occurrence-1',
          kind: 'occurrence.cancelled',
          occurredAt: AT(15),
          reason: 'Registrada por engano',
        },
      ],
    })

    expect(timeline.stages.at(-1)).toMatchObject({
      durationSeconds: null,
      stage: 'cancelled',
      terminal: true,
    })
    expect(timeline.timings.resolvedAt).toBeNull()
  })

  test('cada etapa leva quem a começou', () => {
    const { stages } = buildOccurrenceTimeline({
      sources: [RECORDED, caseTo('c1', 3, 'under_review')],
    })

    expect(stages.map((stage) => stage.actor)).toEqual([
      { kind: 'driver', name: 'Motorista Alves' },
      { kind: 'operation', name: 'Operadora Lima' },
    ])
  })

  test('o evento do retorno entra na linha do tempo com o status e o motivo', () => {
    const { events } = buildOccurrenceTimeline({
      sources: [RECORDED, replyTo('r1', 5, 'needs_operator', 'document_not_confirmed')],
    })

    expect(events.at(-1)).toMatchObject({
      id: 'contractor.reply:r1',
      isKey: false,
      reason: 'document_not_confirmed',
      toStatus: 'needs_operator',
    })
  })
})
