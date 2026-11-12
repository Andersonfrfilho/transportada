/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 294 T1.1: o painel tolera `recordedTogether` e a origem `driver` da correção de endereço antes
 * da API publicar; kind e origem desconhecidos nunca derrubam a linha do tempo.
 */
import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'
import { resolveTripTimelineAddressChange } from '../../src/modules/trip/shared/tripTimelineAddressChange.service'
import { resolveTripTimelineChips } from '../../src/modules/trip/shared/tripTimelineRow.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()
const translate = (key: string): string => key

const ITEM = {
  actorName: 'Marina Alves',
  channel: 'driver_app' as const,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'stop.departed' as const,
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-11-01T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 1 },
  toStatus: null,
}

const ADDRESS_ITEM = {
  ...ITEM,
  id: 'item-2',
  kind: 'stop.address_corrected' as const,
}

function readItems(items: readonly unknown[]) {
  return adapters.tripTimelineFromApi({ items, nextCursor: null }).items
}

describe('etapa marcada junto (spec 294 RF2)', () => {
  it('sem o campo, o item passa e não ganha chip', () => {
    const [item] = readItems([ITEM])

    expect(item?.recordedTogether).toBeUndefined()
    expect(resolveTripTimelineChips(item!, translate).map((chip) => chip.id)).not.toContain(
      'together',
    )
  })

  it('recordedTogether false não ganha chip', () => {
    const [item] = readItems([{ ...ITEM, recordedTogether: false }])

    expect(resolveTripTimelineChips(item!, translate).map((chip) => chip.id)).not.toContain(
      'together',
    )
  })

  it('recordedTogether true ganha o chip discreto', () => {
    const [item] = readItems([{ ...ITEM, recordedTogether: true }])
    const chip = resolveTripTimelineChips(item!, translate).find(({ id }) => id === 'together')

    expect(chip).toEqual({
      id: 'together',
      label: 'eventTimeline.chip.recordedTogether',
      tone: 'neutral',
    })
  })

  it('recusa recordedTogether que não é booleano', () => {
    expect(() => readItems([{ ...ITEM, recordedTogether: 'true' }])).toThrow()
  })

  it('o rótulo e a dica existem em pt e en', () => {
    for (const locale of [tripPt, tripEn]) {
      expect(locale.eventTimeline.chip.recordedTogether.length).toBeGreaterThan(0)
      expect(locale.eventTimeline.chip.recordedTogetherHint.length).toBeGreaterThan(0)
    }
  })
})

describe('endereço corrigido pelo motorista e origens novas (spec 294 RF16)', () => {
  it('origem driver tem texto próprio em pt', () => {
    expect(tripPt.eventTimeline.addressChange.origin.driver).toBe(
      'Endereço corrigido pela chegada do motorista',
    )
  })

  it('origem desconhecida passa e cai no rótulo neutro', () => {
    const [item] = readItems([
      { ...ADDRESS_ITEM, addressChange: { displacementMeters: null, origin: 'future_origin' } },
    ])

    expect(resolveTripTimelineAddressChange(item!, translate)?.origin).toBe(
      'eventTimeline.addressChange.origin.unknown',
    )
    expect(tripPt.eventTimeline.addressChange.origin.unknown.length).toBeGreaterThan(0)
    expect(tripEn.eventTimeline.addressChange.origin.unknown.length).toBeGreaterThan(0)
  })

  it('kind desconhecido sai da página sem derrubar os outros itens', () => {
    const items = readItems([{ ...ITEM, id: 'x', kind: 'stop.future_kind' }, ITEM])

    expect(items.map(({ id }) => id)).toEqual(['item-1'])
  })
})
