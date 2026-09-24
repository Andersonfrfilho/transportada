import { describe, expect, it } from 'bun:test'

import {
  collectTripTimelineDocuments,
  filterTripTimelineItemsByDocumentIds,
  removeDuplicateDispatchEvents,
  resolveTripTimelineAuthorshipText,
  resolveTripTimelineTitle,
  resolveTripTimelineTone,
} from '../../src/modules/trip/shared/tripTimeline.service'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'office',
  closeReason: null,
  document: { id: 'doc-1', number: '123', series: '1' },
  fromStatus: null,
  id: 'item-1',
  kind: 'document.status_changed',
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: 'João Pereira',
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 1 },
  toStatus: 'separated',
}

function fakeTranslate(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key
  const entries = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',')
  return `${key}(${entries})`
}

/**
 * Spec 158 T8 (D5, D8): `trip.dispatched` e `trip.status_changed` com `toStatus='dispatched'` no
 * mesmo instante descrevem o mesmo fato — mostra só o `status_changed`.
 */
describe('remoção do par de despacho duplicado (spec 158 T8)', () => {
  it('remove trip.dispatched quando há trip.status_changed para dispatched no mesmo instante', () => {
    const dispatched: TripTimelineItem = {
      ...BASE_ITEM,
      channel: null,
      document: null,
      id: 'dispatched-1',
      kind: 'trip.dispatched',
      occurredAt: '2026-09-18T10:00:00.000Z',
      stop: null,
      toStatus: null,
    }
    const statusChanged: TripTimelineItem = {
      ...BASE_ITEM,
      fromStatus: 'route_planned',
      id: 'status-changed-1',
      kind: 'trip.status_changed',
      occurredAt: '2026-09-18T10:00:00.000Z',
      stop: null,
      toStatus: 'dispatched',
    }

    const result = removeDuplicateDispatchEvents([dispatched, statusChanged])

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('status-changed-1')
  })

  it('mantém trip.dispatched quando não há o par de status_changed (viagem anterior ao deploy)', () => {
    const dispatched: TripTimelineItem = {
      ...BASE_ITEM,
      channel: null,
      document: null,
      id: 'dispatched-1',
      kind: 'trip.dispatched',
      occurredAt: '2026-09-18T10:00:00.000Z',
      stop: null,
      toStatus: null,
    }

    const result = removeDuplicateDispatchEvents([dispatched])

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('dispatched-1')
  })

  it('não remove trip.dispatched de instante diferente do status_changed', () => {
    const dispatched: TripTimelineItem = {
      ...BASE_ITEM,
      channel: null,
      document: null,
      id: 'dispatched-1',
      kind: 'trip.dispatched',
      occurredAt: '2026-09-18T09:00:00.000Z',
      stop: null,
      toStatus: null,
    }
    const statusChanged: TripTimelineItem = {
      ...BASE_ITEM,
      fromStatus: 'route_planned',
      id: 'status-changed-1',
      kind: 'trip.status_changed',
      occurredAt: '2026-09-18T10:00:00.000Z',
      stop: null,
      toStatus: 'dispatched',
    }

    const result = removeDuplicateDispatchEvents([dispatched, statusChanged])

    expect(result).toHaveLength(2)
  })
})

/**
 * Spec 180 RF12/RF13: o filtro deixa de ser "a nota aberta, sim ou não" e passa a aceitar várias
 * notas — e os eventos da viagem (sem documento) continuam visíveis, porque comparar duas notas sem
 * saber quando a viagem saiu tira o sentido da linha do tempo.
 */
describe('filtro por notas escolhidas (spec 180)', () => {
  const otherDocument: TripTimelineItem = {
    ...BASE_ITEM,
    document: { id: 'doc-2', number: '456', series: null },
    id: 'item-2',
  }
  const tripEvent: TripTimelineItem = { ...BASE_ITEM, document: null, id: 'item-3' }

  it('sem nota escolhida, devolve todos os itens', () => {
    const result = filterTripTimelineItemsByDocumentIds(
      [BASE_ITEM, otherDocument, tripEvent],
      new Set(),
    )

    expect(result).toHaveLength(3)
  })

  it('com uma nota escolhida, mantém a nota e os eventos da viagem', () => {
    const result = filterTripTimelineItemsByDocumentIds(
      [BASE_ITEM, otherDocument, tripEvent],
      new Set(['doc-1']),
    )

    expect(result.map((item) => item.id)).toEqual(['item-1', 'item-3'])
  })

  it('com duas notas escolhidas, mantém as duas', () => {
    const result = filterTripTimelineItemsByDocumentIds(
      [BASE_ITEM, otherDocument, tripEvent],
      new Set(['doc-1', 'doc-2']),
    )

    expect(result.map((item) => item.id)).toEqual(['item-1', 'item-2', 'item-3'])
  })

  it('lista as notas presentes nos itens, sem repetir, para montar o seletor', () => {
    const repeated: TripTimelineItem = { ...BASE_ITEM, id: 'item-4' }

    const result = collectTripTimelineDocuments([BASE_ITEM, otherDocument, tripEvent, repeated])

    expect(result.map((document) => document.id)).toEqual(['doc-1', 'doc-2'])
  })

  it('sem nenhuma nota nos itens, não oferece seletor', () => {
    expect(collectTripTimelineDocuments([tripEvent])).toHaveLength(0)
  })
})

describe('título do item por kind (spec 158 T8)', () => {
  it('trip.created (spec 171 RF3/CA02)', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      document: null,
      fromStatus: null,
      kind: 'trip.created',
      stop: null,
      toStatus: null,
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.tripCreated',
    )
  })

  it('trip.dispatched', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'trip.dispatched', toStatus: null }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe('eventTimeline.itemTitle.dispatched')
  })

  it('trip.status_changed conhecido ganha título próprio por transição (spec 158 T10)', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'trip.status_changed',
      toStatus: 'on_delivery_route',
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.tripStatus.on_delivery_route',
    )
  })

  it('trip.status_changed desconhecido cai no título genérico — nunca o código cru', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'trip.status_changed', toStatus: 'x' }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.statusChanged(status=eventTimeline.itemTitle.unknownStatus)',
    )
  })

  it('stop.arrived usa a sequência da parada', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      document: null,
      kind: 'stop.arrived',
      stop: { id: 'stop-2', sequence: 2 },
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.stopArrived(sequence=2)',
    )
  })

  it('stop.arrived sem parada cai no rótulo genérico — nunca id cru', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      document: null,
      kind: 'stop.arrived',
      stop: null,
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.stopArrivedUnknown',
    )
  })

  it('document.delivered usa número/série da nota', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'document.delivered' }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentDelivered(document=eventTimeline.itemTitle.documentLabel(invoice=123/1))',
    )
  })

  it('document.delivered sem número/série cai no rótulo genérico — nunca id cru', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      document: { id: 'doc-9', number: null, series: null },
      kind: 'document.delivered',
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentDelivered(document=eventTimeline.itemTitle.unknownDocument)',
    )
  })

  it('document.returned usa número/série da nota', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'document.returned' }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentReturned(document=eventTimeline.itemTitle.documentLabel(invoice=123/1))',
    )
  })

  it('stop.occurrence usa o tipo da ocorrência', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      document: null,
      kind: 'stop.occurrence',
      occurrence: { note: '', typeName: 'Avaria' },
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.stopOccurrence(type=Avaria)',
    )
  })

  it('document.occurrence combina a nota e o tipo', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'document.occurrence',
      occurrence: { note: '', typeName: 'Recusa parcial' },
    }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentOccurrence(document=eventTimeline.itemTitle.documentLabel(invoice=123/1),type=Recusa parcial)',
    )
  })

  it('document.status_changed conhecido segue o molde "Nota X entregue" (spec 158 T10)', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'document.status_changed' }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentStatus.separated(document=eventTimeline.itemTitle.documentLabel(invoice=123/1))',
    )
  })

  it('document.status_changed desconhecido cai no título genérico', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'document.status_changed', toStatus: 'x' }
    expect(resolveTripTimelineTitle(item, fakeTranslate)).toBe(
      'eventTimeline.itemTitle.documentStatusChanged(document=eventTimeline.itemTitle.documentLabel(invoice=123/1),status=eventTimeline.itemTitle.unknownStatus)',
    )
  })
})

/** Spec 158 T10: o marcador do trilho carrega o tom do fato — conclusão, problema ou andamento. */
describe('tom do marcador por kind (spec 158 T10)', () => {
  it('entrega e viagem concluída são conclusão', () => {
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'document.delivered' })).toBe('done')
    expect(
      resolveTripTimelineTone({ ...BASE_ITEM, kind: 'trip.status_changed', toStatus: 'completed' }),
    ).toBe('done')
  })

  it('devolução, ocorrência e cancelamento são problema', () => {
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'document.returned' })).toBe('problem')
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'stop.occurrence' })).toBe('problem')
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'document.occurrence' })).toBe('problem')
    expect(
      resolveTripTimelineTone({ ...BASE_ITEM, kind: 'trip.status_changed', toStatus: 'cancelled' }),
    ).toBe('problem')
    expect(
      resolveTripTimelineTone({
        ...BASE_ITEM,
        kind: 'document.status_changed',
        toStatus: 'returned',
      }),
    ).toBe('problem')
  })

  it('o resto é andamento', () => {
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'trip.dispatched' })).toBe('progress')
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'stop.arrived' })).toBe('progress')
    expect(resolveTripTimelineTone({ ...BASE_ITEM, kind: 'document.status_changed' })).toBe(
      'progress',
    )
  })
})

/**
 * Spec 171 (caso extremo): viagem criada por semeadura ou importação sem ator humano diz "pelo
 * sistema", frase diferente de "usuário removido" — as duas leituras têm `actorName: null`, mas
 * significam coisas diferentes.
 */
describe('autoria de trip.created sem ator (spec 171)', () => {
  it('trip.created sem actorName vira "pelo sistema"', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      actorName: null,
      channel: 'backoffice',
      kind: 'trip.created',
    }
    expect(resolveTripTimelineAuthorshipText(item, fakeTranslate)).toBe('authorship.system')
  })

  it('trip.created com actorName segue a autoria comum por canal', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, channel: 'backoffice', kind: 'trip.created' }
    expect(resolveTripTimelineAuthorshipText(item, fakeTranslate)).toBe(
      'authorship.backoffice(actor=Marina Alves)',
    )
  })

  it('outro kind sem actorName continua "usuário removido", nunca "pelo sistema"', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      actorName: null,
      channel: 'backoffice',
      kind: 'trip.status_changed',
    }
    expect(resolveTripTimelineAuthorshipText(item, fakeTranslate)).toBe(
      'authorship.backoffice(actor=authorship.removedActor)',
    )
  })
})

/** Spec 171 RF5/CA05: a animação de entrada é CSS puro e desliga sob prefers-reduced-motion. */
describe('animação de entrada da linha do tempo (spec 171)', () => {
  it('a classe .itemEnter tem keyframe e respeita prefers-reduced-motion', async () => {
    const source = new URL('../../src/modules/trip/styles/tripTimeline.module.css', import.meta.url)
    const css = await Bun.file(source).text()

    expect(css).toContain('@keyframes tripTimelineItemEnter')
    expect(css).toMatch(/\.itemEnter\s*{[^}]*animation:\s*tripTimelineItemEnter/)
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.itemEnter\s*{\s*animation:\s*none/,
    )
  })
})
