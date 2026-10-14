/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A nota (ou a parada inteira) retirada de uma viagem ainda no barracão, na linha do tempo: o kind, a
 * chave `documentRelease` com chave exata e o texto. Dados sintéticos.
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
import { resolveTripTimelineDocumentRelease } from '../../src/modules/trip/shared/tripTimelineDocumentRelease.service'
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
  document: { id: 'doc-1', number: '907064', series: '2' },
  fromStatus: null,
  id: 'released-1',
  kind: 'document.released' as const,
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-10-13T16:08:15.526Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

const DOCUMENT_RELEASE = {
  note: 'Endereço sem coordenada',
  scope: 'stop' as const,
  stopLabel: 'Parada 2',
}

const RELEASED_ITEM = { ...BASE_ITEM, documentRelease: DOCUMENT_RELEASE }

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

describe('a retirada de nota na linha do tempo', () => {
  it('document.released é o último kind, tem ícone de remover, tom neutro e fica fora do mapa', () => {
    expect([...TRIP_TIMELINE_KINDS].slice(-1)).toEqual(['document.released'])
    expect(resolveTripTimelineIcon({ ...RELEASED_ITEM })).toEqual({
      icon: 'remove',
      tone: 'neutral',
    })
    expect(TIMELINE_MAP_CATEGORY_BY_KIND['document.released']).toBeNull()
  })

  it('o título nomeia a nota', () => {
    expect(resolveTripTimelineTitle(RELEASED_ITEM as TripTimelineItem, translate)).toBe(
      'eventTimeline.itemTitle.documentReleased(document=eventTimeline.itemTitle.documentLabel(invoice=907064/2))',
    )
  })

  it('aceita o evento completo e recusa chave a mais, faltando ou fora do tipo', () => {
    expect(parse(RELEASED_ITEM)[0]?.documentRelease).toEqual(DOCUMENT_RELEASE)
    expect(() => parse(BASE_ITEM)).toThrow()
    const invalids: readonly Record<string, unknown>[] = [
      { ...DOCUMENT_RELEASE, actorUserId: 'x' },
      { ...DOCUMENT_RELEASE, scope: 'trip' },
      { ...DOCUMENT_RELEASE, note: 3 },
      { note: null, scope: 'document' },
    ]
    for (const invalid of invalids) {
      expect(() => parse({ ...BASE_ITEM, documentRelease: invalid })).toThrow()
    }
  })

  it('documentRelease em outro kind reprova a página', () => {
    expect(() =>
      parse({ ...BASE_ITEM, documentRelease: DOCUMENT_RELEASE, kind: 'trip.created' }),
    ).toThrow()
  })

  it('o texto traz a parada, o aviso de parada inteira e o motivo', () => {
    expect(
      resolveTripTimelineDocumentRelease(RELEASED_ITEM as TripTimelineItem, translate),
    ).toEqual({
      note: 'eventTimeline.documentRelease.note(note=Endereço sem coordenada)',
      scope: 'eventTimeline.documentRelease.wholeStop',
      stop: 'eventTimeline.documentRelease.stop(stop=Parada 2)',
    })
    expect(
      resolveTripTimelineDocumentRelease(
        {
          ...RELEASED_ITEM,
          documentRelease: { note: null, scope: 'document', stopLabel: null },
        } as TripTimelineItem,
        translate,
      ),
    ).toEqual({ note: null, scope: null, stop: null })
  })

  it('os textos existem em português e em inglês', () => {
    for (const dictionary of [tripPt, tripEn]) {
      for (const path of [
        'eventTimeline.itemTitle.documentReleased',
        'eventTimeline.documentRelease.note',
        'eventTimeline.documentRelease.stop',
        'eventTimeline.documentRelease.wholeStop',
      ]) {
        expect(typeof lookup(dictionary, path)).toBe('string')
      }
    }
  })
})
