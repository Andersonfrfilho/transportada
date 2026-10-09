/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 T2.1 (D9): as notas acrescentadas a uma viagem que já saiu, na linha do tempo — o kind, a
 * chave `documentsAdded` com chave exata e o texto. Dados sintéticos.
 */
import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'
import {
  TRIP_TIMELINE_KINDS,
  type TripTimelineItem,
} from '../../src/modules/trip/shared/trip.types'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { resolveTripTimelineIcon } from '../../src/modules/trip/shared/tripTimelineRow.service'
import { resolveTripTimelineTitle } from '../../src/modules/trip/shared/tripTimeline.service'
import { resolveTripTimelineDocumentsAdded } from '../../src/modules/trip/shared/tripTimelineDocumentsAdded.service'
import { TIMELINE_MAP_CATEGORY_BY_KIND } from '../../src/modules/trip/shared/tripTimelineMap.constant'

const adapters = createTripResponseAdapters()

const translate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined
    ? key
    : `${key}(${Object.entries(options)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`

const BASE_ITEM = {
  actorName: 'Marina Alves',
  channel: 'backoffice' as const,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'added-1',
  kind: 'documents_added' as const,
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-10-08T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

const DOCUMENTS_ADDED = {
  documentCount: 3,
  documentsWithoutCte: 2,
  mdfeDocumentDivergence: true,
  reason: 'Van quebrou, a outra assume as notas',
}

const ADDED_ITEM = { ...BASE_ITEM, documentsAdded: DOCUMENTS_ADDED }

function parse(item: unknown): readonly TripTimelineItem[] {
  return adapters.tripTimelineFromApi({ items: [item], nextCursor: null }).items
}

function lookup(dictionary: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    )
}

describe('vocabulário da linha do tempo com as notas acrescentadas (spec 257)', () => {
  it('documents_added é o último kind, depois da transferência de tripulação', () => {
    expect([...TRIP_TIMELINE_KINDS].slice(-2)).toEqual(['crew_transfer', 'documents_added'])
  })

  it('o evento tem ícone de documento, tom neutro e fica fora do mapa da viagem', () => {
    expect(resolveTripTimelineIcon({ ...ADDED_ITEM })).toEqual({
      icon: 'document',
      tone: 'neutral',
    })
    expect(TIMELINE_MAP_CATEGORY_BY_KIND.documents_added).toBeNull()
  })

  it('o título é "Notas acrescentadas"', () => {
    expect(resolveTripTimelineTitle(ADDED_ITEM as TripTimelineItem, translate)).toBe(
      'eventTimeline.itemTitle.documentsAdded',
    )
    expect(lookup(tripPt, 'eventTimeline.itemTitle.documentsAdded')).toBe('Notas acrescentadas')
  })
})

describe('validação do documentsAdded, com chave exata (spec 257 D9)', () => {
  it('aceita o evento completo', () => {
    expect(parse(ADDED_ITEM)[0]?.documentsAdded).toEqual(DOCUMENTS_ADDED)
  })

  it('o item documents_added sem documentsAdded é inválido', () => {
    expect(() => parse(BASE_ITEM)).toThrow()
  })

  it('documentsAdded em qualquer outro kind reprova a página', () => {
    for (const kind of TRIP_TIMELINE_KINDS.filter((candidate) => candidate !== 'documents_added')) {
      if (kind === 'crew_transfer') continue
      expect(() => parse({ ...BASE_ITEM, documentsAdded: DOCUMENTS_ADDED, kind })).toThrow()
    }
  })

  it('recusa chave a mais, chave faltando e valor fora do tipo', () => {
    const invalids: readonly Record<string, unknown>[] = [
      { ...DOCUMENTS_ADDED, nfeDocumentIds: ['x'] },
      { ...DOCUMENTS_ADDED, documentCount: -1 },
      { ...DOCUMENTS_ADDED, documentCount: '3' },
      { ...DOCUMENTS_ADDED, documentsWithoutCte: null },
      { ...DOCUMENTS_ADDED, mdfeDocumentDivergence: 'true' },
      { ...DOCUMENTS_ADDED, reason: null },
    ]
    for (const invalid of invalids) {
      expect(() => parse({ ...BASE_ITEM, documentsAdded: invalid })).toThrow()
    }
    for (const key of Object.keys(DOCUMENTS_ADDED)) {
      const copy: Record<string, unknown> = { ...DOCUMENTS_ADDED }
      delete copy[key]
      expect(() => parse({ ...BASE_ITEM, documentsAdded: copy })).toThrow()
    }
  })

  it('um kind desconhecido de uma API mais nova é descartado, não recusa a página', () => {
    const page = adapters.tripTimelineFromApi({
      items: [{ ...ADDED_ITEM, kind: 'stop.invented_by_a_newer_api' }],
      nextCursor: null,
    })

    expect(page.items).toEqual([])
  })
})

describe('o texto do acréscimo (spec 257 D9)', () => {
  it('só o evento de acréscimo tem o resumo', () => {
    expect(
      resolveTripTimelineDocumentsAdded({ ...BASE_ITEM, kind: 'trip.created' }, translate),
    ).toBeNull()
    expect(resolveTripTimelineDocumentsAdded({ ...BASE_ITEM }, translate)).toBeNull()
  })

  it('traz a contagem, o motivo e os avisos fiscais', () => {
    expect(resolveTripTimelineDocumentsAdded(ADDED_ITEM, translate)).toEqual({
      count: 'eventTimeline.documentsAdded.count(count=3)',
      cteWarning: 'eventTimeline.documentsAdded.withoutCte(count=2)',
      hasMdfeDivergence: true,
      reason: 'eventTimeline.documentsAdded.reason(reason=Van quebrou, a outra assume as notas)',
    })
  })

  it('sem nota sem CT-e e sem divergência, os avisos somem', () => {
    const view = resolveTripTimelineDocumentsAdded(
      {
        ...BASE_ITEM,
        documentsAdded: {
          ...DOCUMENTS_ADDED,
          documentsWithoutCte: 0,
          mdfeDocumentDivergence: false,
        },
      },
      translate,
    )

    expect(view?.cteWarning).toBeNull()
    expect(view?.hasMdfeDivergence).toBe(false)
  })
})

describe('textos do acréscimo nos dois idiomas (spec 257 D9)', () => {
  const KEYS = [
    'eventTimeline.itemTitle.documentsAdded',
    'eventTimeline.documentsAdded.count_one',
    'eventTimeline.documentsAdded.count_other',
    'eventTimeline.documentsAdded.withoutCte_one',
    'eventTimeline.documentsAdded.withoutCte_other',
    'eventTimeline.documentsAdded.reason',
    'eventTimeline.documentsAdded.mdfeDivergence',
  ]

  it('pt-BR e en têm todas as chaves, com os marcadores iguais', () => {
    const placeholders = (text: unknown) =>
      String(text)
        .match(/\{\{\w+\}\}/gu)
        ?.sort() ?? []
    for (const key of KEYS) {
      expect([key, typeof lookup(tripPt, key)]).toEqual([key, 'string'])
      expect([key, typeof lookup(tripEn, key)]).toEqual([key, 'string'])
      expect(placeholders(lookup(tripEn, key))).toEqual(placeholders(lookup(tripPt, key)))
    }
  })
})
