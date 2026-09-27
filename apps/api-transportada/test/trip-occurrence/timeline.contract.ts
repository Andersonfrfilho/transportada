/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T206 (RF19): a linha do tempo da ocorrência. A política é pura — recebe os fatos já
 * lidos (registro, fotos, tratativa da 164, e-mails da 143) e decide ordem, intervalo desde o evento
 * anterior, eventos-chave, cor do ator e os três tempos do topo.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceTimeline,
  type OccurrenceTimelineSource,
} from '../../src/trips/domain/occurrence-timeline.policy.js'

const RECORDED: OccurrenceTimelineSource = {
  actor: { kind: 'driver', name: 'Motorista Alves' },
  id: 'occurrence-1',
  kind: 'occurrence.recorded',
  occurredAt: '2026-09-24T10:00:00.000Z',
}

function caseTransition(
  id: string,
  occurredAt: string,
  from: null | string,
  to: string,
  actorKind: 'contractor' | 'operation' = 'operation',
): OccurrenceTimelineSource {
  return {
    actor: { kind: actorKind, name: actorKind === 'operation' ? 'Operadora Lima' : null },
    fromStatus: from,
    id,
    kind: 'case.transition',
    note: '',
    occurredAt,
    toStatus: to,
  } as OccurrenceTimelineSource
}

function mail(
  id: string,
  occurredAt: string,
  direction: 'inbound' | 'outbound',
  interpretation: null | string = null,
): OccurrenceTimelineSource {
  return {
    actor:
      direction === 'outbound'
        ? { kind: 'operation', name: 'Operadora Lima' }
        : { kind: 'contractor', name: null },
    deliveryStatus: direction === 'outbound' ? 'sent' : null,
    id,
    interpretation,
    kind: direction === 'outbound' ? 'contractor.mail.sent' : 'contractor.mail.received',
    occurredAt,
  } as OccurrenceTimelineSource
}

function photo(id: string, occurredAt: string): OccurrenceTimelineSource {
  return {
    actor: { kind: 'driver', name: 'Motorista Alves' },
    id,
    kind: 'occurrence.photo',
    occurredAt,
    photoCount: 1,
  }
}

describe('a linha do tempo da ocorrência (spec 183 RF19)', () => {
  test('ordena do mais antigo para o mais novo e mede o intervalo desde o anterior', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        caseTransition('e2', '2026-09-24T10:20:00.000Z', 'recorded', 'under_review'),
        RECORDED,
        caseTransition('e1', '2026-09-24T10:00:00.000Z', null, 'recorded'),
      ],
    })

    expect(timeline.events.map((event) => event.id)).toEqual([
      'occurrence.recorded:occurrence-1',
      'case.transition:e1',
      'case.transition:e2',
    ])
    expect(timeline.events.map((event) => event.sincePreviousSeconds)).toEqual([null, 0, 1200])
  })

  test('no mesmo instante o registro vem antes das fotos, e estas antes da tratativa', () => {
    const at = '2026-09-24T10:00:00.000Z'
    const timeline = buildOccurrenceTimeline({
      sources: [caseTransition('e1', at, null, 'recorded'), photo('p1', at), RECORDED],
    })

    expect(timeline.events.map((event) => event.kind)).toEqual([
      'occurrence.recorded',
      'occurrence.photo',
      'case.transition',
    ])
  })

  test('fotos gravadas no mesmo instante viram um evento só, com a contagem', () => {
    const at = '2026-09-24T10:00:00.000Z'
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        photo('p1', at),
        photo('p2', at),
        photo('p3', '2026-09-24T11:00:00.000Z'),
      ],
    })

    const photos = timeline.events.filter((event) => event.kind === 'occurrence.photo')
    expect(
      photos.map((event) => (event.kind === 'occurrence.photo' ? event.photoCount : 0)),
    ).toEqual([2, 1])
  })

  test('eventos-chave são o registro e a decisão — o resto não', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        caseTransition('e1', '2026-09-24T10:30:00.000Z', 'recorded', 'under_review'),
        caseTransition(
          'e2',
          '2026-09-24T11:00:00.000Z',
          'awaiting_contractor',
          'decided',
          'contractor',
        ),
      ],
    })

    expect(timeline.events.map((event) => event.isKey)).toEqual([true, false, true])
  })

  test('o ator de cada evento é um dos quatro, o mesmo dos balões', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        mail('m1', '2026-09-24T10:10:00.000Z', 'outbound'),
        mail('m2', '2026-09-24T10:40:00.000Z', 'inbound', 'message'),
      ],
    })

    expect(timeline.events.map((event) => event.actor.kind)).toEqual([
      'driver',
      'operation',
      'contractor',
    ])
  })
})

describe('os três tempos do topo (spec 183 RF19)', () => {
  test('ocorrência aberta: o tempo corre até agora, sem fechamento', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [RECORDED],
    })

    expect(timeline.timings).toEqual({
      contractorAskedAt: null,
      contractorRepliedAt: null,
      driverReleasedAt: null,
      openSince: '2026-09-24T10:00:00.000Z',
      openUntil: null,
    })
  })

  test('a contratante responde depois do primeiro envio; resposta automática não conta', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        mail('m1', '2026-09-24T10:10:00.000Z', 'outbound'),
        mail('m2', '2026-09-24T10:12:00.000Z', 'inbound', 'ignored_auto_reply'),
        mail('m3', '2026-09-24T10:55:00.000Z', 'inbound', 'message'),
        mail('m4', '2026-09-24T11:30:00.000Z', 'inbound', 'approve'),
      ],
    })

    expect(timeline.timings.contractorAskedAt).toBe('2026-09-24T10:10:00.000Z')
    expect(timeline.timings.contractorRepliedAt).toBe('2026-09-24T10:55:00.000Z')
  })

  test('sem envio não há tempo de resposta, mesmo com e-mail recebido', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [RECORDED, mail('m1', '2026-09-24T10:10:00.000Z', 'inbound', 'message')],
    })

    expect(timeline.timings.contractorAskedAt).toBeNull()
    expect(timeline.timings.contractorRepliedAt).toBeNull()
  })

  test('o motorista é liberado quando a tratativa sai do caminho dele; fecha no terminal', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        caseTransition('e1', '2026-09-24T10:30:00.000Z', 'under_review', 'awaiting_contractor'),
        caseTransition(
          'e2',
          '2026-09-24T11:00:00.000Z',
          'awaiting_contractor',
          'decided',
          'contractor',
        ),
        caseTransition('e3', '2026-09-24T11:40:00.000Z', 'decided', 'closed'),
      ],
    })

    expect(timeline.timings.driverReleasedAt).toBe('2026-09-24T11:00:00.000Z')
    expect(timeline.timings.openUntil).toBe('2026-09-24T11:40:00.000Z')
  })

  test('devolução ao barracão libera o motorista e encerra no mesmo instante', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        caseTransition('e1', '2026-09-24T10:30:00.000Z', 'under_review', 'returned_to_warehouse'),
      ],
    })

    expect(timeline.timings.driverReleasedAt).toBe('2026-09-24T10:30:00.000Z')
    expect(timeline.timings.openUntil).toBe('2026-09-24T10:30:00.000Z')
  })
})
