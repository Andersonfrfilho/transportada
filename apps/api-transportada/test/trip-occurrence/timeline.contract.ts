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

describe('o cancelamento na linha do tempo da ocorrência (spec 240 RF9)', () => {
  const CANCELLED: OccurrenceTimelineSource = {
    actor: { kind: 'operation', name: 'Operadora Lima' },
    id: 'occurrence-1',
    kind: 'occurrence.cancelled',
    occurredAt: '2026-09-24T11:00:00.000Z',
    reason: 'registrada na nota errada',
  } as OccurrenceTimelineSource

  test('entra depois do que aconteceu antes, com o motivo e o autor', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [CANCELLED, photo('p1', '2026-09-24T10:00:00.000Z'), RECORDED],
    })

    expect(timeline.events.map((event) => event.id)).toEqual([
      'occurrence.recorded:occurrence-1',
      'occurrence.photo:p1',
      'occurrence.cancelled:occurrence-1',
    ])
    const last = timeline.events.at(-1)
    expect(last?.actor).toEqual({ kind: 'operation', name: 'Operadora Lima' })
    expect(last).toMatchObject({ reason: 'registrada na nota errada', sincePreviousSeconds: 3600 })
  })

  test('no mesmo instante o cancelamento vem por último', () => {
    const at = '2026-09-24T10:00:00.000Z'
    const timeline = buildOccurrenceTimeline({
      sources: [
        { ...CANCELLED, occurredAt: at } as OccurrenceTimelineSource,
        mail('m1', at, 'outbound'),
        RECORDED,
      ],
    })

    expect(timeline.events.map((event) => event.kind)).toEqual([
      'occurrence.recorded',
      'contractor.mail.sent',
      'occurrence.cancelled',
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

  test('o cancelamento da ocorrência fecha o relógio no instante dele (spec 240 T6.5)', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [
        RECORDED,
        {
          actor: { kind: 'operation', name: 'Operadora Lima' },
          id: 'occurrence-1',
          kind: 'occurrence.cancelled',
          occurredAt: '2026-09-24T12:00:00.000Z',
          reason: 'Lançada na nota errada',
        },
      ],
    })

    expect(timeline.timings.openUntil).toBe('2026-09-24T12:00:00.000Z')
    expect(timeline.timings.driverReleasedAt).toBeNull()
  })

  test('sem cancelamento nem terminal da tratativa, o relógio segue aberto', () => {
    expect(buildOccurrenceTimeline({ sources: [RECORDED] }).timings.openUntil).toBeNull()
  })
})

/**
 * Spec 266 T2.9: espelho das expectativas do guard do painel
 * (`tripOccurrenceTimeline.validation.ts`, T3.3) — nenhuma app importa código de outra, então a regra
 * é repetida aqui e o JSON que a API produz passa por ela. Se o guard do painel mudar, este espelho muda junto.
 */
const PANEL_ACTOR_KINDS = ['contractor', 'driver', 'operation', 'system']

function panelAccepts(value: unknown): boolean {
  const event = value as Record<string, unknown>
  const actor = event.actor as { kind?: unknown; name?: unknown } | undefined
  const isNullableString = (field: unknown) => field === null || typeof field === 'string'
  if (
    actor === undefined ||
    !PANEL_ACTOR_KINDS.includes(actor.kind as string) ||
    !isNullableString(actor.name) ||
    typeof event.id !== 'string' ||
    typeof event.isKey !== 'boolean' ||
    typeof event.occurredAt !== 'string' ||
    !(event.sincePreviousSeconds === null || typeof event.sincePreviousSeconds === 'number')
  ) {
    return false
  }
  if (event.kind === 'resolution.resolved') return isNullableString(event.note)
  return event.kind === 'resolution.reopened'
}

describe('o andamento na linha do tempo (spec 266 T2.9)', () => {
  const resolved = (actorKind: 'operation' | 'system'): OccurrenceTimelineSource => ({
    actor:
      actorKind === 'system'
        ? { kind: 'system', name: null }
        : { kind: 'operation', name: 'Operadora Lima' },
    id: 'resolution-1',
    kind: 'resolution.resolved',
    note: actorKind === 'system' ? null : 'Resolvido por telefone',
    occurredAt: '2026-09-24T11:00:00.000Z',
    phraseKey: actorKind === 'system' ? 'case_closed' : null,
  })
  const reopened: OccurrenceTimelineSource = {
    actor: { kind: 'driver', name: 'Motorista Alves' },
    id: 'resolution-2',
    kind: 'resolution.reopened',
    messageId: 'message-9',
    occurredAt: '2026-09-24T12:00:00.000Z',
  }

  test('resolvida e reaberta entram em ordem, como eventos-chave, e o JSON passa pelo guard do painel', () => {
    const timeline = buildOccurrenceTimeline({
      sources: [reopened, RECORDED, resolved('operation')],
    })

    expect(timeline.events.map((event) => event.kind)).toEqual([
      'occurrence.recorded',
      'resolution.resolved',
      'resolution.reopened',
    ])
    expect(timeline.events.slice(1).every((event) => event.isKey)).toBe(true)
    expect(timeline.events[1]).toMatchObject({
      actor: { kind: 'operation', name: 'Operadora Lima' },
      id: 'resolution.resolved:resolution-1',
      note: 'Resolvido por telefone',
      phraseKey: null,
    })
    expect(timeline.events[2]).toMatchObject({ actor: { kind: 'driver' }, messageId: 'message-9' })
    const json = JSON.parse(JSON.stringify(timeline)) as { events: unknown[] }
    expect(json.events.slice(1).every(panelAccepts)).toBe(true)
  })

  test('a resolução do sistema leva note nulo e a chave da frase fixa', () => {
    const [, event] = buildOccurrenceTimeline({ sources: [RECORDED, resolved('system')] }).events
    expect(event).toMatchObject({
      actor: { kind: 'system', name: null },
      note: null,
      phraseKey: 'case_closed',
    })
    expect(panelAccepts(JSON.parse(JSON.stringify(event)))).toBe(true)
  })

  test('no mesmo instante a resolução vem depois do registro e da tratativa; não mexe nos três tempos', () => {
    const at = RECORDED.occurredAt
    const timeline = buildOccurrenceTimeline({
      sources: [
        { ...reopened, occurredAt: at },
        { ...resolved('operation'), occurredAt: at },
        RECORDED,
      ],
    })
    expect(timeline.events.map((event) => event.kind)).toEqual([
      'occurrence.recorded',
      'resolution.resolved',
      'resolution.reopened',
    ])
    expect(timeline.timings.openUntil).toBeNull()
    expect(timeline.timings.driverReleasedAt).toBeNull()
  })
})
