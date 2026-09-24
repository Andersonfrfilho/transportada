import { describe, expect, it } from 'bun:test'

import { hasTripTimelineExpandableDetail } from '../../src/modules/trip/shared/tripTimelineDetail.service'
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

/**
 * Spec 180 RF16/CA14/CA16: expandir só existe quando há algo a mostrar além de título, hora e
 * autoria — evento sem nada a acrescentar não oferece o controle.
 */
describe('detalhe expansível do evento (spec 180 RF16)', () => {
  it('devolução com motivo tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'document.returned',
      returnReason: 'recipient_refused',
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(true)
  })

  it('devolução sem motivo não tem detalhe', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'document.returned', returnReason: null }
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('encerramento manual com motivo tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      closeReason: 'cliente pediu para adiantar',
      kind: 'trip.status_changed',
      toStatus: 'completed',
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(true)
  })

  it('mudança de situação sem ser o encerramento com motivo não tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'trip.status_changed',
      toStatus: 'dispatched',
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('ocorrência com observação tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'stop.occurrence',
      occurrence: { note: 'Avaria na embalagem', typeName: 'Avaria' },
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(true)
  })

  it('ocorrência com anexo e sem observação tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'document.occurrence',
      occurrence: { attachmentCount: 2, note: '', typeName: 'Recusa parcial' },
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(true)
  })

  it('ocorrência sem observação e sem anexo não tem detalhe', () => {
    const item: TripTimelineItem = {
      ...BASE_ITEM,
      kind: 'stop.occurrence',
      occurrence: { attachmentCount: 0, note: '', typeName: 'Avaria' },
    }
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('ocorrência sem registro carregado não tem detalhe — nunca inventa o vazio', () => {
    const item: TripTimelineItem = { ...BASE_ITEM, kind: 'stop.occurrence', occurrence: null }
    expect(hasTripTimelineExpandableDetail(item)).toBe(false)
  })

  it('kind sem nenhuma dessas condições não tem detalhe', () => {
    expect(hasTripTimelineExpandableDetail({ ...BASE_ITEM, kind: 'trip.created' })).toBe(false)
    expect(hasTripTimelineExpandableDetail({ ...BASE_ITEM, kind: 'stop.arrived' })).toBe(false)
    expect(hasTripTimelineExpandableDetail({ ...BASE_ITEM, kind: 'document.delivered' })).toBe(
      false,
    )
  })
})
