/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1: a fiação do filtro no detalhe da viagem. O comportamento está provado nos contratos de DOM e no
 * smoke; aqui só se prende o que o detalhe, grande demais para montar num contrato, tem de ligar: o filtro fica
 * antes da lista de paradas, a lista e o grupo sem parada recebem o mesmo recorte, e "marcar todas" não alcança a
 * nota que o filtro escondeu (marcar e emitir CT-e de nota que ninguém vê seria ação às cegas).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const DETAIL_SOURCE = readFileSync(
  new URL('../../src/modules/trip/components/TripDetail.component.tsx', import.meta.url),
  'utf8',
)

describe('o filtro do prazo no detalhe da viagem (spec 236 P2)', () => {
  it('o detalhe monta o recorte uma vez, sobre as notas da viagem', () => {
    expect(DETAIL_SOURCE).toContain('useTripDeliveryDeadlineScope(trip.documents)')
  })

  it('o seletor fica depois do título das cargas e antes da lista de paradas', () => {
    const title = DETAIL_SOURCE.indexOf('id="trip-stops-title"')
    const filter = DETAIL_SOURCE.indexOf('<TripDeliveryDeadlineFilter', title)
    const list = DETAIL_SOURCE.indexOf('<TripStopList', title)

    expect(filter).toBeGreaterThan(title)
    expect(filter).toBeLessThan(list)
  })

  it('a lista de paradas e a lista das notas sem parada recebem o mesmo recorte', () => {
    const list = DETAIL_SOURCE.indexOf('<TripStopList')
    const unassigned = DETAIL_SOURCE.indexOf('<TripStopDocumentGroup')

    expect(DETAIL_SOURCE.slice(list, list + 400)).toContain(
      'visibleDocumentIds={deadlineScope.visibleDocumentIds}',
    )
    expect(DETAIL_SOURCE.slice(unassigned, unassigned + 300)).toContain(
      'documents={deadlineScope.keepVisible(unassignedDocuments)}',
    )
  })

  it('"marcar todas" cobre só as notas que o filtro deixa à mostra', () => {
    const title = DETAIL_SOURCE.indexOf('id="trip-stops-title"')
    const selectAll = DETAIL_SOURCE.indexOf('<TripSelectAllDocuments', title)

    expect(DETAIL_SOURCE.slice(selectAll, selectAll + 300)).toContain(
      'documentIds={deadlineScope.visibleDocuments.map((document) => document.id)}',
    )
  })
})
